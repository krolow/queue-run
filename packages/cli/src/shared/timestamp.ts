export function localTimestamp(timestamp: Date) {
  return `${localDate(timestamp)} ${localTime(timestamp)}`;
}

export function localDate(timestamp: Date) {
  return [
    timestamp.getFullYear(),
    (timestamp.getMonth() + 1).toString().padStart(2, "0"),
    timestamp.getDate().toString().padStart(2, "0"),
  ].join("-");
}

export function localTime(timestamp: Date) {
  return [
    timestamp.getHours().toString().padStart(2, "0"),
    timestamp.getMinutes().toString().padStart(2, "0"),
    timestamp.getSeconds().toString().padStart(2, "0"),
  ].join(":");
}
