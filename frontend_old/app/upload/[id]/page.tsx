import ClipsGallery from "../../../components/ClipsGallery";

export default function UploadPage({ params }: { params: { id: string } }) {
  const uploadId = Number(params.id);

  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold mb-6">Generated Clips</h1>
      <ClipsGallery uploadId={uploadId} />
    </main>
  );
}
