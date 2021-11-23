export default function (payload: { text: string }) {
  console.log("Payload 7: %o", payload);
}

export const config = {
  retries: 2,
};
