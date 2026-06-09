import * as React from 'react'

import {
  Body,
  Container,
  Head,
  Heading,
  Img,
  Html,
  Preview,
  Text,
} from '@react-email/components'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="pl" dir="ltr">
    <Head />
    <Preview>Twój kod weryfikacyjny</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src="https://financeyou.pl/__l5e/assets-v1/58b0a934-fc94-423a-95ed-aca9497ecd99/favicon.png" width="64" height="64" alt="FinanceYou" style={{ display: "block", margin: "0 auto 16px" }} />
        <Heading style={h1}>Potwierdź swoją tożsamość</Heading>
        <Text style={text}>Użyj poniższego kodu, aby potwierdzić swoją tożsamość:</Text>
        <Text style={codeStyle}>{token}</Text>
        <Text style={footer}>
          Kod wygaśnie wkrótce. Jeśli nie prosiłeś o ten kod, możesz zignorować
          tę wiadomość.
        </Text>
        <Text style={{ fontSize: "11px", color: "#bbbbbb", marginTop: "32px", textAlign: "center" as const }}>
          <Link href="https://financeyou.pl/email/unsubscribe" style={{ color: "#bbbbbb", textDecoration: "underline" }}>Nie chcę otrzymywać tych wiadomości</Link>
        </Text>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '20px 25px' }
const h1 = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: '#000000',
  margin: '0 0 20px',
}
const text = {
  fontSize: '14px',
  color: '#55575d',
  lineHeight: '1.5',
  margin: '0 0 25px',
}
const codeStyle = {
  fontFamily: 'Courier, monospace',
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: '#000000',
  margin: '0 0 30px',
}
const footer = { fontSize: '12px', color: '#999999', margin: '30px 0 0' }
