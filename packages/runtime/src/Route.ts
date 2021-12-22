import { MatchFunction } from "path-to-regexp";
import { Queue } from "./loadServices";

export type HTTPRoute = {
  accepts: Set<string>;
  cors: boolean;
  filename: string;
  match: MatchFunction<{ [key: string]: string }>;
  methods: Set<string>;
  queue?: Queue;
  timeout: number;
};
