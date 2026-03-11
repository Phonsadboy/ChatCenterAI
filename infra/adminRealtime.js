const { publishAdminEvent, subscribeAdminEvents } = require("./eventBus");

let adminIo = null;
let unsubscribe = null;

function emitLocalAdminEvent(eventName, payload) {
  if (!adminIo) return;
  if (adminIo.local && typeof adminIo.local.to === "function") {
    adminIo.local.to("admin").emit(eventName, payload);
    return;
  }
  adminIo.to("admin").emit(eventName, payload);
}

async function attachAdminRealtimeBridge(io) {
  adminIo = io;
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  unsubscribe = await subscribeAdminEvents(({ eventName, payload }) => {
    emitLocalAdminEvent(eventName, payload);
  });
}

async function emitAdminRoomEvent(eventName, payload) {
  emitLocalAdminEvent(eventName, payload);
  try {
    await publishAdminEvent(eventName, payload);
  } catch (error) {
    console.error("[AdminRealtime] publish failed:", error?.message || error);
  }
}

module.exports = {
  attachAdminRealtimeBridge,
  emitAdminRoomEvent,
};
