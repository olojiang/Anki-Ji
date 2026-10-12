"use client";
import { use } from "react";
import { Reader } from "@/components/share-ir/Reader";
export default function ReaderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <Reader key={id} id={Number(id)} />;
}
