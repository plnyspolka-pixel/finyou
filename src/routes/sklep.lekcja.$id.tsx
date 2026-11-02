import { useEffect,useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { getStoreLessonAccess } from "@/lib/storefront/purchased.functions";
import { MarketingShell } from "@/components/marketing/shell";

export const Route=createFileRoute("/sklep/lekcja/$id")({component:LessonPage});
function LessonPage(){
  const {id}=Route.useParams();
  const fetchLesson=useServerFn(getStoreLessonAccess);
  const [lesson,setLesson]=useState<Awaited<ReturnType<typeof getStoreLessonAccess>>|null>(null);
  const [error,setError]=useState("");
  useEffect(()=>{
    let active=true;
    setLesson(null);setError("");
    fetchLesson({data:{lessonId:id}}).then(v=>{if(active)setLesson(v)})
      .catch(e=>{if(active)setError(e instanceof Error?e.message:"Nie można otworzyć lekcji.")});
    return ()=>{active=false};
  },[id,fetchLesson]);
  return <MarketingShell page="sklep"><main className="mx-auto max-w-4xl px-4 py-12">
    <a href="/sklep/zakupy" className="text-sm underline">← Moje zakupy</a>
    {error?<div role="alert" className="mt-6 rounded-xl border p-5"><p>{error}</p><a href={"/logowanie?next="+encodeURIComponent("/sklep/lekcja/"+id)} className="underline">Zaloguj się, jeśli masz już dostęp</a></div>:
      lesson?<div className="mt-6 space-y-5"><h1 className="text-2xl font-bold">{lesson.title}</h1><p>{lesson.description}</p>
      {lesson.url?<video src={lesson.url} controls playsInline preload="metadata" className="w-full rounded-xl bg-black" />:<p>Materiał tymczasowo niedostępny.</p>}
      <p className="text-xs text-muted-foreground">Dostęp jest przypisany do Twojego konta. Link do filmu wygasa i jest odnawiany po ponownym otwarciu strony.</p></div>:<p className="mt-6">Sprawdzanie uprawnień do lekcji…</p>}
  </main></MarketingShell>;
}
