import {createFileRoute} from "@tanstack/react-router";
import {useServerFn} from "@tanstack/react-start";
import {useEffect,useState} from "react";
import {getWindykatorVoiceAdminState,provisionWindykatorVoiceAgent,
  syncWindykatorVoiceAgent,bindWindykatorPhone
} from "@/lib/windykator-startowy/voice-admin.functions";
export const Route=createFileRoute("/admin/windykator-voice")({
  component:WindykatorVoiceAdmin
});
function WindykatorVoiceAdmin(){
  const getState=useServerFn(getWindykatorVoiceAdminState);
  const provision=useServerFn(provisionWindykatorVoiceAgent);
  const sync=useServerFn(syncWindykatorVoiceAgent);
  const assign=useServerFn(bindWindykatorPhone);
  const [state,setState]=useState<any>(null),[phoneId,setPhoneId]=useState("");
  const [busy,setBusy]=useState(false),[info,setInfo]=useState("");
  const [error,setError]=useState("");
  async function reload(){try{setState(await getState());setError("");}
    catch(e){setError(e instanceof Error?e.message:"Brak dostępu administratora.");}}
  useEffect(()=>{void reload()},[]);
  async function act(fn:()=>Promise<unknown>){
    setBusy(true);setError("");setInfo("");
    try{await fn();setInfo("Operacja została zapisana w ElevenLabs i Finance You.");await reload();}
    catch(e){setError(e instanceof Error?e.message:"Błąd połączenia.");}
    finally{setBusy(false);}
  }
  return <main className="mx-auto max-w-3xl space-y-6 px-5 py-10 text-slate-900">
    <header><p className="text-sm font-semibold text-amber-700">Finance You — osobny agent A5</p>
      <h1 className="mt-2 text-3xl font-black">Windykator AI · ElevenLabs</h1>
      <p className="mt-2 text-slate-600">Nowy agent, oddzielny numer i osobny podpisany webhook. Nie używa A1 ani A4.</p>
    </header>
    {error&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {info&&<p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{info}</p>}
    <section className="rounded-2xl border bg-white p-6">
      <h2 className="text-xl font-bold">1. Utwórz agenta A5 i webhook po rozmowie</h2>
      <p className="mt-2 text-sm text-slate-600">Jedno wywołanie tworzy nowego agenta w ElevenLabs, zapisuje jego ID i konfiguruje izolowany webhook do zapisu ustaleń.</p>
      <p className="mt-4 text-sm">Agent: <strong>{state?.agent_id??"nieutworzony"}</strong></p>
      <p className="text-sm">Webhook: <strong>{state?.postcallReady?"skonfigurowany":"brak"}</strong></p>
      <button type="button" disabled={busy} onClick={()=>void act(()=>provision())}
        className="mt-4 rounded-lg bg-amber-400 px-5 py-3 font-bold text-slate-950 disabled:opacity-40">
        {state?.agent_id?"Sprawdź / dokończ konfigurację":"Utwórz nowego agenta ElevenLabs"}
      </button>
      {state?.agent_id&&<button type="button" disabled={busy} onClick={()=>void act(()=>sync())}
        className="ml-3 mt-3 rounded-lg border px-5 py-3 font-semibold disabled:opacity-40">
        Zaktualizuj prompt A5
      </button>}
    </section>
    <section className="rounded-2xl border bg-white p-6">
      <h2 className="text-xl font-bold">2. Dedykowany numer telefoniczny</h2>
      <p className="mt-2 text-sm text-slate-600">Zaimportuj NOWY numer w ElevenLabs i wpisz jego ID. System odmówi przejęcia numeru już przypisanego do innego agenta.</p>
      <p className="my-3 text-sm">Numer: <strong>{state?.phone_e164??"brak"}</strong></p>
      <label htmlFor="phoneId" className="text-sm font-semibold">ElevenLabs phone_number_id</label>
      <input id="phoneId" className="mt-1 w-full rounded-lg border p-3" value={phoneId}
        placeholder="phone_number_id" onChange={e=>setPhoneId(e.target.value)}/>
      <button type="button" disabled={busy||!state?.agent_id||phoneId.length<8}
        onClick={()=>void act(()=>assign({data:{phoneNumberId:phoneId}}))}
        className="mt-3 rounded-lg bg-slate-900 px-5 py-3 font-bold text-white disabled:opacity-40">Przypisz numer A5</button>
    </section>
    <section className="rounded-2xl border bg-white p-6 text-sm text-slate-700">
      <h2 className="text-xl font-bold text-slate-900">3. Rozmowy w obu kierunkach</h2>
      <p className="mt-2">Połączenia wychodzące są obsługiwane przez ElevenLabs API przy użyciu dedykowanego numeru i tylko dla aktywnych spraw po opłaceniu, weryfikacji salda i sprawdzeniu limitów.</p>
      <p className="mt-3">Dla numeru A5 ustaw w zakładce Security → Fetch initiation client data from webhook:</p>
      <code className="mt-2 block break-all rounded bg-slate-100 p-3">/api/public/hooks/windykator-voice-init</code>
      <p className="mt-2">Wymagany nagłówek <code>x-webhook-secret</code> zgodny z serwerowym sekretem <code>WINDYKATOR_VOICE_INIT_SECRET</code>. Bez niego endpoint bezpiecznie odmawia dostępu.</p>
      <p className="mt-3">Webhook po rozmowie jest tworzony osobno przez API ElevenLabs. Nie kieruj go na webhook A1/A4.</p>
      <p className="mt-3">Produkcja: flaga <code>WINDYKATOR_VOICE_OUTBOUND_ENABLED=true</code> dopiero po sprawdzeniu połączeń, warunków prawnych i retencji danych.</p>
    </section>
    <button onClick={()=>void reload()} type="button" className="rounded-lg border px-5 py-3 text-sm">Odśwież stan</button>
  </main>;
}
