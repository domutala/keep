import type { Folder, Note } from "../stores/notes";

export type ContentItem =
  | {
      type: "folder";
      folder: Folder;
      latestNote?: Note;
      summary: string;
      date: string;
    }
  | { type: "note"; note: Note; date: string };
