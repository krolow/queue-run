export default function (payload: { text: string }) {
  console.log("Payload 1: %o", payload);
}

export const config = {
  retries: 2,
};
