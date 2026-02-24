import { notFound } from "next/navigation";
import { getPaste } from "@/lib/storage";
import PasteView from "./PasteView";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function PastePage({ params }: Props) {
  const { id } = await params;
  const paste = await getPaste(id);

  if (!paste) {
    notFound();
  }

  return <PasteView paste={paste} />;
}
