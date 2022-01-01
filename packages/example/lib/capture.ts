export default async function capture(url: string): Promise<string> {
  // This could take several seconds, sometimes it would hang on for a minute or
  // two, sometimes fail
  console.info('📸 Capturing "%s"', url);
  return "screenshot.png";
}
