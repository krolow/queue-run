const cronToFriendly: Record<string, string> = {
  "0 * * * *": "hourly",
  "0 0 * * *": "daily",
  "0 0 1 * *": "monthly",
};

export default function displayCron(cron: string | null): string {
  if (cron === null) return "never";
  const friendly = cronToFriendly[cron];
  return friendly ?? cron;
}
