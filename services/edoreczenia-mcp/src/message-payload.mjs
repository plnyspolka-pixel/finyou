/**
 * Text-only electronic message payload for UA API v3 ("Message" schema).
 * No attachments or hybrid service in this minimal generator.
 * Before PROD verify against official v3.0.8 OpenAPI on INT.
 */
export function outgoingPayload(box,data) {
  const {recipients,subject,text}=data;
  if (text.length>5000) throw new Error('UA API textBody is limited to 5000 characters. Add an attachment instead.');
  if (!recipients.every(r=>/^AE:PL-[A-Za-z0-9-]{5,100}$/.test(r))) {
    throw new Error('Recipients must be valid ADE addresses');
  }
  if (new Set(recipients).size!==recipients.length) throw new Error('Duplicate recipient');
  return {
    messageMetadata: {
      from:{eDeliveryAddress:box.ade},
      to:recipients.map(eDeliveryAddress=>({eDeliveryAddress})),
      subject,
      shippingService:'electronic'
    },
    textBody:text
  };
}
export function verifiedPayload(box,data) {
  if (!data.uaPayload) return outgoingPayload(box,data);
  const p=data.uaPayload;
  const m=p.messageMetadata;
  if (!m||typeof m!=='object'||
      m.from?.eDeliveryAddress!==box.ade ||
      m.subject!==data.subject ||
      m.shippingService!=='electronic' ||
      p.textBody!==data.text ||
      !Array.isArray(m.to) ||
      m.to.length!==data.recipients.length ||
      JSON.stringify(m.to.map(x=>x.eDeliveryAddress).sort())!==JSON.stringify([...data.recipients].sort())) {
    throw new Error('Raw UA payload sender, recipients, subject or text differs from approved draft');
  }
  return p;
}
