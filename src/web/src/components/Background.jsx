// Soft, light ambient gradient blobs sitting behind the page content.
export default function Background() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
      <div className="absolute -top-32 -left-24 h-96 w-96 rounded-full bg-violet-300/40 blur-3xl" />
      <div className="absolute top-1/3 -right-24 h-[28rem] w-[28rem] rounded-full bg-sky-300/40 blur-3xl" />
      <div className="absolute bottom-0 left-1/3 h-96 w-96 rounded-full bg-blue-200/50 blur-3xl" />
    </div>
  );
}
