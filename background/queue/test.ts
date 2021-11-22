export default function (payload: { text: string }) {
  console.log("Payload: %o", payload);
}

export const config = {
  retries: 2,
};
