const MESSAGE_EVENT = 'chatspace:message-update';
const ROOMS_REFRESH_EVENT = 'chatspace:rooms-refresh';

export function publishMessageUpdate(detail) {
  window.dispatchEvent(new CustomEvent(MESSAGE_EVENT, { detail }));
}

export function subscribeToMessageUpdates(listener) {
  window.addEventListener(MESSAGE_EVENT, listener);
  return () => window.removeEventListener(MESSAGE_EVENT, listener);
}

export function requestRoomsRefresh() {
  window.dispatchEvent(new CustomEvent(ROOMS_REFRESH_EVENT));
}

export function subscribeToRoomsRefresh(listener) {
  window.addEventListener(ROOMS_REFRESH_EVENT, listener);
  return () => window.removeEventListener(ROOMS_REFRESH_EVENT, listener);
}
