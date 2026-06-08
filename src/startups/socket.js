const jwt = require("jsonwebtoken");
const Chat = require("../models/chat");
const Message = require("../models/message");

module.exports = function (io) {
  // SOCKET.IO
  // ─────────────────────────────────────────────
  const onlineUsers = new Map();

  // ══════════════════════════════════════════════
  //  ── AUTH MIDDLEWARE
  // ══════════════════════════════════════════════
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;

    if (!token) {
      return next(new Error("Authentication error! token required!"));
    }

    try {
      const user = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
      socket.user = user;
      console.log("Socket User:", socket.user);
      next();
    } catch (error) {
      return next(new Error("Authentication error! invalid token!"));
    }
  });

  io.on("connection", (socket) => {
    console.log("A user connected");

    const userId = socket.user._id.toString();

    // Send user data back to frontend
    socket.emit("userData", socket.user);

    // ══════════════════════════════════════════════
    // ── TRACK ONLINE USERS
    // Multiple sockets per user supported
    // ══════════════════════════════════════════════
    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set());
    }
    onlineUsers.get(userId).add(socket.id);

    console.log("Online Users:", [...onlineUsers.keys()]);

    // ══════════════════════════════════════════════

    //  ── MARK GROUP MESSAGES AS DELIVERED
    // ══════════════════════════════════════════════

    socket.on("markGroupMessagesAsDelivered", async () => {
      try {
        const chatIds = await Chat.find({
          members: userId,
          isGroup: true,
        }).distinct("_id");

        // ✅ Case 1 — messages where user HAS an entry but it's still "sent"
        const messagesWithEntry = await Message.find({
          chatId: { $in: chatIds },
          sender: { $ne: userId },
          deliveryStatus: {
            $elemMatch: {
              user: userId,
              status: "sent",
            },
          },
        }).select("_id chatId sender");

        for (const message of messagesWithEntry) {
          await Message.updateOne(
            {
              _id: message._id,
              "deliveryStatus.user": userId,
            },
            {
              $set: {
                "deliveryStatus.$.status": "delivered",
                "deliveryStatus.$.deliveredAt": new Date(),
              },
            },
          );
        }

        // ✅ Case 2 — messages where user has NO entry at all
        // This happens when user joined group after message was sent
        const messagesWithoutEntry = await Message.find({
          chatId: { $in: chatIds },
          sender: { $ne: userId },
          "deliveryStatus.user": { $ne: userId }, // ← no entry for this user
        }).select("_id chatId sender");

        if (messagesWithoutEntry.length > 0) {
          for (const message of messagesWithoutEntry) {
            // ✅ Push a new deliveryStatus entry for this user
            await Message.updateOne(
              { _id: message._id },
              {
                $push: {
                  deliveryStatus: {
                    user: userId,
                    status: "delivered",
                    deliveredAt: new Date(),
                    seenAt: null,
                  },
                },
              },
            );
          }
        }

        //  Combine both for notification
        const allUpdated = [...messagesWithEntry, ...messagesWithoutEntry];

        if (!allUpdated.length) return;

        const groupedChatIds = allUpdated.reduce((acc, msg) => {
          const senderId = msg.sender.toString();
          if (!acc[senderId]) acc[senderId] = new Set();
          acc[senderId].add(msg.chatId.toString());
          return acc;
        }, {});

        for (const senderId in groupedChatIds) {
          groupedChatIds[senderId] = [...groupedChatIds[senderId]];
        }

        for (const senderId in groupedChatIds) {
          const senderSockets = onlineUsers.get(senderId);
          if (!senderSockets) continue;

          senderSockets.forEach((socketId) => {
            io.to(socketId).emit("messageStatusUpdated", {
              status: "delivered",
              chatIds: groupedChatIds[senderId],
            });
          });
        }
      } catch (error) {
        console.error("markGroupMessagesAsDelivered error:", error);
      }
    });
    // ══════════════════════════════════════════════
    //  ── MARK MESSAGES AS DELIVERED
    // Fires when user comes online
    // ══════════════════════════════════════════════
    socket.on("markMessagesAsDelivered", async () => {
      try {
        console.log(`markMessagesAsDelivered to ${userId}`);

        const chatIds = await Chat.find({ members: userId }).distinct("_id");
        console.log("Found chats:", chatIds.length);

        const undeliveredMessages = await Message.find({
          chatId: { $in: chatIds },
          status: "sent",
          sender: { $ne: userId },
        }).select("_id chatId sender");

        console.log("Undelivered messages:", undeliveredMessages.length);

        if (!undeliveredMessages.length) return;

        await Message.updateMany({ _id: { $in: undeliveredMessages.map((msg) => msg._id) } }, { $set: { status: "delivered" } });

        // step 1 Group by sender so we notify the right person
        const groupedChatIds = undeliveredMessages.reduce((acc, msg) => {
          const senderId = msg.sender.toString();
          if (!acc[senderId]) acc[senderId] = new Set();
          acc[senderId].add(msg.chatId.toString());
          return acc;
        }, {});

        for (const senderId in groupedChatIds) {
          groupedChatIds[senderId] = [...groupedChatIds[senderId]];
        }

        for (const senderId in groupedChatIds) {
          const senderSockets = onlineUsers.get(senderId);
          if (!senderSockets) continue;

          senderSockets.forEach((socketId) => {
            io.to(socketId).emit("messageStatusUpdated", {
              status: "delivered",
              chatIds: groupedChatIds[senderId],
            });
          });

          console.log(`Notified sender ${senderId}`);
        }
      } catch (error) {
        console.error("markMessagesAsDelivered error:", error);
      }
    });

    // ══════════════════════════════════════════════
    //  ── MARK MESSAGES AS SEEN
    // ══════════════════════════════════════════════
    socket.on("markMessagesAsSeen", async ({ chatId }) => {
      try {
        if (!chatId) return;

        const unseenMessages = await Message.find({
          chatId: chatId,
          sender: { $ne: userId },
          status: { $ne: "seen" },
        }).select("_id sender");

        if (!unseenMessages.length) return;

        const messageIds = unseenMessages.map((m) => m._id);

        // ✅ Fix 1 — $set and $addToSet are siblings, not nested
        await Message.updateMany(
          { _id: { $in: messageIds } },
          {
            $set: { status: "seen" },
            $addToSet: { seenBy: userId }, // ✅ correct position
          },
        );

        // ✅ Fix 2 — also update deliveryStatus per-user entry
        // This is what was missing — simple status updates but deliveryStatus never touched
        for (const messageId of messageIds) {
          await Message.updateOne(
            {
              _id: messageId,
              "deliveryStatus.user": userId,
            },
            {
              $set: {
                "deliveryStatus.$.status": "seen",
                "deliveryStatus.$.seenAt": new Date(),
              },
            },
          );
        }

        // ✅ Update chat lastMessage
        await Chat.findByIdAndUpdate(chatId, {
          $addToSet: { "lastMessage.seenBy": userId },
        });

        const senderIds = [...new Set(unseenMessages.map((m) => m.sender.toString()))];

        for (const senderId of senderIds) {
          const sockets = onlineUsers.get(senderId);
          if (sockets) {
            sockets.forEach((socketId) => {
              io.to(socketId).emit("messagesSeen", { chatId, seenBy: userId });
            });
          }
        }
      } catch (error) {
        console.error("markMessagesAsSeen error:", error);
      }
    });
    // ══════════════════════════════════════════════
    //  ── MARK Group MESSAGES AS SEEN
    // ══════════════════════════════════════════════
    socket.on("markGroupMessagesAsSeen", async (chatId) => {
      try {
        if (!chatId) return;

        // ✅ Case 1 — user HAS entry, not seen yet
        const messagesWithEntry = await Message.find({
          chatId: chatId,
          sender: { $ne: userId },
          deliveryStatus: {
            $elemMatch: {
              user: userId,
              status: { $ne: "seen" },
            },
          },
        }).select("_id sender");

        for (const message of messagesWithEntry) {
          await Message.updateOne(
            {
              _id: message._id,
              "deliveryStatus.user": userId,
            },
            {
              $set: {
                "deliveryStatus.$.status": "seen",
                "deliveryStatus.$.seenAt": new Date(),
              },
            },
          );
        }

        // ✅ Case 2 — user has NO entry at all (joined after message sent)
        const messagesWithoutEntry = await Message.find({
          chatId: chatId,
          sender: { $ne: userId },
          "deliveryStatus.user": { $ne: userId },
        }).select("_id sender");

        for (const message of messagesWithoutEntry) {
          await Message.updateOne(
            { _id: message._id },
            {
              $push: {
                deliveryStatus: {
                  user: userId,
                  status: "seen",
                  deliveredAt: new Date(),
                  seenAt: new Date(),
                },
              },
            },
          );
        }

        // ✅ Combine both
        const allUpdated = [...messagesWithEntry, ...messagesWithoutEntry];
        if (!allUpdated.length) return;

        // ✅ Update seenBy on all messages
        await Message.updateMany({ _id: { $in: allUpdated.map((m) => m._id) } }, { $addToSet: { seenBy: userId } });

        await Chat.findByIdAndUpdate(chatId, {
          $addToSet: { "lastMessage.seenBy": userId },
        });

        const senderIds = [...new Set(allUpdated.map((m) => m.sender.toString()))];

        for (const senderId of senderIds) {
          const sockets = onlineUsers.get(senderId);
          if (sockets) {
            sockets.forEach((socketId) => {
              io.to(socketId).emit("messagesSeen", { chatId, seenBy: userId });
            });
          }
        }
      } catch (error) {
        console.error("markGroupMessagesAsSeen error:", error);
      }
    });
    // ══════════════════════════════════════════════
    //  ── TYPING INDICATORS
    // ══════════════════════════════════════════════
    socket.on("typing", ({ chatId }) => {
      socket.to(chatId).emit("showTyping", `${socket.user.username} is typing...`);
    });

    socket.on("stopTyping", ({ chatId }) => {
      socket.to(chatId).emit("hideTyping", socket.user.username);
    });

    // ══════════════════════════════════════════════
    //  ── JOIN ROOM
    // ══════════════════════════════════════════════
    // socket.on("joinRoom", (chatId) => {
    //   socket.join(chatId);
    //   console.log(`User ${userId} joined room ${chatId}`);
    // });
    socket.on("joinRoom", async (chatId) => {
      socket.join(chatId);
      console.log(`User ${userId} joined room ${chatId}`);

      // ✅ Auto-mark messages as seen when user joins the room
      try {
        const chat = await Chat.findById(chatId);
        if (!chat) return;

        if (chat.isGroup) {
          // ── Group chat ──

          // Case 1 — user HAS entry, not seen yet
          const messagesWithEntry = await Message.find({
            chatId: chatId,
            sender: { $ne: userId },
            deliveryStatus: {
              $elemMatch: {
                user: userId,
                status: { $ne: "seen" },
              },
            },
          }).select("_id sender");

          // Case 2 — user has NO entry (joined after message was sent)
          const messagesWithoutEntry = await Message.find({
            chatId: chatId,
            sender: { $ne: userId },
            "deliveryStatus.user": { $ne: userId },
          }).select("_id sender");

          // Update existing entries
          for (const message of messagesWithEntry) {
            await Message.updateOne(
              {
                _id: message._id,
                "deliveryStatus.user": userId,
              },
              {
                $set: {
                  "deliveryStatus.$.status": "seen",
                  "deliveryStatus.$.seenAt": new Date(),
                },
              },
            );
          }

          // Push new entries for messages where user had no entry
          for (const message of messagesWithoutEntry) {
            await Message.updateOne(
              { _id: message._id },
              {
                $push: {
                  deliveryStatus: {
                    user: userId,
                    status: "seen",
                    deliveredAt: new Date(),
                    seenAt: new Date(),
                  },
                },
              },
            );
          }

          const allUpdated = [...messagesWithEntry, ...messagesWithoutEntry];

          if (allUpdated.length > 0) {
            // Update seenBy on all messages
            await Message.updateMany({ _id: { $in: allUpdated.map((m) => m._id) } }, { $addToSet: { seenBy: userId } });

            // Update chat lastMessage seenBy
            await Chat.findByIdAndUpdate(chatId, {
              $addToSet: { "lastMessage.seenBy": userId },
            });

            // Notify senders
            const senderIds = [...new Set(allUpdated.map((m) => m.sender.toString()))];

            for (const senderId of senderIds) {
              const sockets = onlineUsers.get(senderId);
              if (sockets) {
                sockets.forEach((socketId) => {
                  io.to(socketId).emit("messagesSeen", { chatId, seenBy: userId });
                });
              }
            }
          }
        } else {
          // ── Private chat ──
          const unseenMessages = await Message.find({
            chatId: chatId,
            sender: { $ne: userId },
            status: { $ne: "seen" },
          }).select("_id sender");

          if (unseenMessages.length > 0) {
            await Message.updateMany(
              { _id: { $in: unseenMessages.map((m) => m._id) } },
              {
                $set: { status: "seen" },
                $addToSet: { seenBy: userId },
              },
            );

            await Chat.findByIdAndUpdate(chatId, {
              $addToSet: { "lastMessage.seenBy": userId },
            });

            const senderIds = [...new Set(unseenMessages.map((m) => m.sender.toString()))];

            for (const senderId of senderIds) {
              const sockets = onlineUsers.get(senderId);
              if (sockets) {
                sockets.forEach((socketId) => {
                  io.to(socketId).emit("messagesSeen", { chatId, seenBy: userId });
                });
              }
            }
          }
        }
      } catch (error) {
        console.error("joinRoom auto-seen error:", error);
      }
    });
    // ══════════════════════════════════════════════
    // ── SEND MESSAGE WITH DB SAVE
    // Client emits: { text, chatId }
    // ══════════════════════════════════════════════
    socket.on("sendMessage", async ({ text, chatId }) => {
      try {
        const senderId = socket.user._id.toString();

        if (!text?.trim()) {
          socket.emit("errorInSendMessage", "Message text is required");
          return;
        }

        if (!chatId) {
          socket.emit("errorInSendMessage", "Chat ID is required");
          return;
        }

        const chat = await Chat.findById(chatId);

        if (!chat) {
          socket.emit("errorInSendMessage", "Chat not found");
          return;
        }

        const isMember = chat.members.some((memberId) => memberId.toString() === senderId);

        if (!isMember) {
          socket.emit("errorInSendMessage", "Access denied");
          return;
        }

        // ✅ Step 1 — define receivers FIRST before using them
        const receiverIds = chat.members.filter((m) => m.toString() !== senderId);
        const receiverId = receiverIds[0]?.toString();
        const isReceiverOnline = receiverId && onlineUsers.has(receiverId);

        console.log("Receiver:", receiverId, "Online:", isReceiverOnline);

        // ✅ Step 2 — deliveryStatus for group chats
        let deliveryStatus;
        if (chat.isGroup) {
          deliveryStatus = receiverIds.map((member) => {
            const online = onlineUsers.has(member.toString());
            return {
              user: member,
              status: online ? "delivered" : "sent",
              deliveredAt: online ? new Date() : null,
              seenAt: null,
            };
          });
        }

        // ✅ Step 3 — deliveredTo now uses already-defined variables
        const deliveredTo = [];
        if (!chat.isGroup) {
          // Private: check the single receiver
          if (isReceiverOnline) {
            deliveredTo.push(receiverId);
          }
        } else {
          // Group: check ALL members not just the first
          receiverIds.forEach((memberId) => {
            if (onlineUsers.has(memberId.toString())) {
              deliveredTo.push(memberId);
            }
          });
        }

        // ✅ Step 4 — save message
        const newMessage = new Message({
          chatId: chat._id,
          sender: senderId,
          text: text.trim(),
          status: isReceiverOnline ? "delivered" : "sent",
          deliveryStatus,
          deliveredTo,
          seenBy: [senderId],
        });

        await newMessage.save();
        console.log("Message saved with status:", newMessage.status);

        // ✅ Step 5 — update chat lastMessage
        chat.lastMessage = newMessage._id;
        await chat.save();

        // ✅ Step 6 — populate and emit to room
        const populatedMessage = await Message.findById(newMessage._id).populate("sender", "_id username profilePicture").populate("deliveryStatus.user", "_id username");

        io.to(chatId).emit("getMessage", populatedMessage);

        // ✅ Step 7 — notify online receivers directly
        if (!chat.isGroup) {
          // Private — notify single receiver
          if (isReceiverOnline) {
            const receiverSockets = onlineUsers.get(receiverId);
            if (receiverSockets) {
              receiverSockets.forEach((socketId) => {
                io.to(socketId).emit("messageStatusUpdated", {
                  status: "delivered",
                  chatIds: [chatId],
                });
              });
            }
          }
        } else {
          // Group — notify ALL online receivers
          receiverIds.forEach((memberId) => {
            const memberIdStr = memberId.toString();
            const memberSockets = onlineUsers.get(memberIdStr);
            if (memberSockets) {
              memberSockets.forEach((socketId) => {
                io.to(socketId).emit("messageStatusUpdated", {
                  status: "delivered",
                  chatIds: [chatId],
                });
              });
            }
          });
        }
      } catch (error) {
        console.error("Send message error:", error);
        socket.emit("errorInSendMessage", "Failed to send message");
      }
    });

    // ══════════════════════════════════════════════
    // DISCONNECT
    // ══════════════════════════════════════════════
    socket.on("disconnect", () => {
      console.log(`User disconnected: ${socket.id}`);

      const userSockets = onlineUsers.get(userId);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          onlineUsers.delete(userId);
        }
      }

      console.log("Online Users:", [...onlineUsers.keys()]);
    });
  });
};
