/** Inline error for a failed query, shown in place of results instead of an empty table. */
export default function ErrorNotice({ message }: { message: string }) {
  return (
    <div role="alert" className="m-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      <p className="font-semibold">Something went wrong running this search.</p>
      <p className="mt-1 break-words">{message}</p>
    </div>
  );
}
