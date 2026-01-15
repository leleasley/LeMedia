declare module "mime/lite" {
  const mime: {
    getExtension: (type: string) => string | null;
  };
  export default mime;
}
