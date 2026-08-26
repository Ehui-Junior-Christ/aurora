declare module "jsmediatags/dist/jsmediatags.min.js" {
  interface TagsResult {
    title?: string;
    artist?: string;
    album?: string;
    year?: string;
    genre?: string;
    track?: string;
    picture?: {
      format: string;
      data: number[];
    };
  }

  interface ReadCallbacks {
    onSuccess?: (result: { tags: TagsResult }) => void;
    onError?: (error: { type: string; info?: string }) => void;
  }

  interface JsMediaTags {
    read(input: File | Blob | string, callbacks: ReadCallbacks): void;
  }

  const jsmediatags: JsMediaTags;
  export default jsmediatags;
  export { TagsResult, ReadCallbacks };
}
