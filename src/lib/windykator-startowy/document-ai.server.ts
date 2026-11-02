/** Bez Lovable: bezpośrednie Gemini REST do analizy dokumentów przed płatnością. */
export async function extractWindykatorDocumentDirect(input:{
  mime:string;bytes:Uint8Array;prompt:string
}):Promise<string>{
  const key=process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY;
  if(!key)throw Error("Brak GEMINI_API_KEY / GOOGLE_GEMINI_API_KEY na serwerze.");
  if(!["application/pdf","image/jpeg","image/png","image/webp"].includes(input.mime))
    throw Error("Nieobsługiwany format dokumentu.");
  if(input.bytes.byteLength>5242880)throw Error("Dokument przekracza limit 5 MB.");
  const model=process.env.WINDYKATOR_DOCUMENT_MODEL || "gemini-2.5-flash";
  if(!/^[a-zA-Z0-9.\-_]+$/.test(model))throw Error("Niepoprawna nazwa modelu.");
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),60000);
  try {
    const response=await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/"+
      encodeURIComponent(model)+":generateContent",{
        method:"POST",signal:controller.signal,
        headers:{"Content-Type":"application/json","x-goog-api-key":key},
        body:JSON.stringify({
          systemInstruction:{parts:[{text:"Analizuj wyłącznie dane jawnie obecne w dokumencie. Braki oznacz null. Nie twórz faktów ani ocen prawnych."}]},
          contents:[{role:"user",parts:[
            {text:input.prompt},
            {inline_data:{mime_type:input.mime,data:Buffer.from(input.bytes).toString("base64")}}
          ]}],
          generationConfig:{responseMimeType:"application/json",temperature:0}
        })
      });
    if(!response.ok)throw Error("Gemini HTTP "+response.status);
    const result=await response.json() as any;
    const value=(result.candidates?.[0]?.content?.parts??[])
      .map((part:any)=>typeof part.text==="string"?part.text:"").join("");
    if(!value||value.length>100000)throw Error("Pusta lub zbyt duża odpowiedź AI.");
    return value;
  }finally{clearTimeout(timer)}
}
