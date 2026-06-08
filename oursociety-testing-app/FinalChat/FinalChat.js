let token = prompt("Enter your Token:");

if (!token) {
  token = prompt("Please enter token, otherwise testing will not work");
}

let typingTimeout;
let user = null;
let currentChatId = null;

const chatFrm = document.getElementById("chatFrm");
const messageContainer = document.getElementById("messageContainer");
const input = document.getElementById("myInput");
const chatIdInput = document.getElementById("chatId");
const joinRoomBtn = document.getElementById("joinRoom");
const chatList = document.getElementById("chatList");
const typingIndicator = document.getElementById("typing");

if (token) {
  const socket = io("http://localhost:3000", {
    auth: { token: token },
  });

  // ── Auth user data from server ──
  socket.on("userData", (data) => {
    user = data;
    console.log("✅ User loaded:", user.username);

    // ✅ Emit delivered AFTER user is loaded
    socket.emit("markMessagesAsDelivered");
  });

  socket.on("connect_error", (err) => {
    console.error("❌ Socket Connection Error:", err.message);
    alert(err.message);
  });

  socket.on("connect", () => {
    console.log("✅ Connected:", socket.id);
  });

  // ══════════════════════════════════════════════
  // STATUS EVENTS
  // ══════════════════════════════════════════════

  // Someone delivered my message
  socket.on("messageStatusUpdated", (data) => {
    console.log("Updated delivered ChatIds", data.chatIds);
    updateMessageStatus("delivered");
  });

  // Someone saw my message
  socket.on("messagesSeen", (data) => {
    console.log("Message Seen", data);
    alert(`Your messages are seen by user - ${data.seenBy}`);
    updateMessageStatus("seen");
  });

  // ══════════════════════════════════════════════
  // JOIN ROOM
  // ══════════════════════════════════════════════
  joinRoomBtn.addEventListener("click", () => {
    currentChatId = chatIdInput.value.trim();

    if (!currentChatId) {
      return alert("Please enter Chat ID");
    }

    chatList.innerHTML = "";

    // Join the socket room
    socket.emit("joinRoom", currentChatId);
    console.log(`🔄 Joining room → ${currentChatId}`);

    // Load previous messages
    getMessagesByChatId(currentChatId);

    // ✅ Mark all messages as seen when opening the chat
    socket.emit("markMessagesAsSeen", { chatId: currentChatId });
  });

  // ══════════════════════════════════════════════
  // SEND MESSAGE
  // ══════════════════════════════════════════════
  chatFrm.addEventListener("submit", (event) => {
    event.preventDefault();

    if (!currentChatId) {
      return alert("Join a room first!");
    }

    const text = input.value.trim();
    if (!text) return;

    socket.emit("sendMessage", {
      text: text,
      chatId: currentChatId,
    });

    input.value = "";

    // Stop typing indicator when message sent
    socket.emit("stopTyping", { chatId: currentChatId });
  });

  // ══════════════════════════════════════════════
  // RECEIVE MESSAGE
  // ══════════════════════════════════════════════
  socket.on("getMessage", (data) => {
    console.log("📩 New Message:", data);
    // ✅ Only append if this message isn't already displayed
    const existingMsg = document.querySelector(`[data-message-id="${data._id}"]`);
    if (existingMsg) return;
    displayMessage(data, data.sender?._id === user?._id);
    smoothScrollToBottom();

    // ✅ Auto mark as seen if chat is open
    if (currentChatId && data.sender?._id !== user?._id) {
      socket.emit("markMessagesAsSeen", { chatId: currentChatId });
    }
  });

  // ══════════════════════════════════════════════
  // TYPING INDICATORS
  // ══════════════════════════════════════════════
  input.addEventListener("input", () => {
    if (!currentChatId) return;

    if (input.value !== "") {
      socket.emit("typing", { chatId: currentChatId });
    }

    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      socket.emit("stopTyping", { chatId: currentChatId });
    }, 2000);
  });

  // ✅ Backend emits "showTyping" → frontend shows it
  socket.on("showTyping", (message) => {
    typingIndicator.innerText = message;
  });

  // ✅ Backend emits "hideTyping" → frontend hides it
  socket.on("hideTyping", () => {
    typingIndicator.innerText = "";
  });

  socket.on("errorInSendMessage", (message) => {
    alert(message);
  });
}

// ══════════════════════════════════════════════
// DISPLAY MESSAGE
// ══════════════════════════════════════════════
function displayMessage(data, isMyMessage = false) {
  if (!user) return;

  const li = document.createElement("li");
  li.classList.add("single_message");
  li.setAttribute("data-message-id", data._id); // ✅ track by id

  const text = data.text || data.content || "[No message text]";

  if (isMyMessage) {
    li.classList.add("my_message");
    li.innerHTML = `
      <p>${text}</p>
      <span>${formatTime(data.createdAt)} • ${data.status || "sent"}</span>
    `;
  } else {
    li.innerHTML = `
      <p>${text}</p>
      <span>${formatTime(data.createdAt)} - by ${data.sender?.username || "Unknown"}</span>
    `;
  }

  document.getElementById("chatList").appendChild(li);
}

// ══════════════════════════════════════════════
// UPDATE MESSAGE STATUS (delivered / seen)
// ══════════════════════════════════════════════
// Status rank — higher number = better status
const STATUS_RANK = { sent: 1, delivered: 2, seen: 3 };

function updateMessageStatus(newStatus) {
  const myMessages = chatList.querySelectorAll(".my_message");

  myMessages.forEach((msgElement) => {
    const statusSpan = msgElement.querySelector("span");
    if (!statusSpan || !statusSpan.textContent.includes("•")) return;

    const parts = statusSpan.textContent.split("•");
    const time = parts[0].trim();
    const currentStatus = parts[1]?.trim();

    // ✅ Only upgrade status — never downgrade
    // "seen" stays "seen", never goes back to "delivered"
    const currentRank = STATUS_RANK[currentStatus] || 0;
    const newRank = STATUS_RANK[newStatus] || 0;

    if (newRank > currentRank) {
      statusSpan.textContent = `${time} • ${newStatus}`;
    }
  });
}
// function updateMessageStatus(newStatus) {
//   const myMessages = chatList.querySelectorAll(".my_message");

//   myMessages.forEach((msgElement) => {
//     const statusSpan = msgElement.querySelector("span");
//     if (statusSpan && statusSpan.textContent.includes("•")) {
//       const time = statusSpan.textContent.split("•")[0].trim();
//       statusSpan.textContent = `${time} • ${newStatus}`;
//     }
//   });
// }

// ══════════════════════════════════════════════
// FETCH MESSAGES VIA REST API
// ══════════════════════════════════════════════
async function getMessagesByChatId(chatId) {
  try {
    chatList.innerHTML = "";

    const response = await fetch(`http://localhost:3000/api/chats/${chatId}/messages`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP Error ${response.status}`);
    }

    const result = await response.json();
    let messages = result.messages || result.data?.messages || result || [];

    if (!Array.isArray(messages)) messages = [];

    console.log(`✅ Loaded ${messages.length} messages`);

    if (!messages.length) {
      const emptyLi = document.createElement("li");
      emptyLi.innerHTML = "<em>No previous messages in this chat.</em>";
      chatList.appendChild(emptyLi);
      return;
    }

    messages.forEach((msg) => {
      const isMyMessage = msg.sender?._id === user?._id || msg.sender?.toString() === user?._id;
      displayMessage(msg, isMyMessage);
    });

    setTimeout(smoothScrollToBottom, 100);
  } catch (error) {
    console.error("❌ Fetch Error:", error);
  }
}

// ══════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════
function formatTime(timestamp) {
  if (!timestamp) return "Just now";
  return new Date(timestamp).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function smoothScrollToBottom() {
  messageContainer.scroll({
    top: messageContainer.scrollHeight,
    behavior: "smooth",
  });
}
