import * as React from 'react'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Img,
  Html,
  Link,
  Preview,
  Text,
} from '@react-email/components'

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const InviteEmail = ({
  siteName,
  siteUrl,
  confirmationUrl,
}: InviteEmailProps) => (
  <Html lang="pl" dir="ltr">
    <Head />
    <Preview>Zaproszenie do {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src="https://financeyou.pl/__l5e/assets-v1/58b0a934-fc94-423a-95ed-aca9497ecd99/favicon.png" width="64" height="64" alt="FinanceYou" style={{ display: "block", margin: "0 auto 16px" }} />
        <Heading style={h1}>Zostałeś zaproszony</Heading>
        <Text style={text}>
          Otrzymałeś zaproszenie do dołączenia do{' '}
          <Link href={siteUrl} style={link}>
            <strong>{siteName}</strong>
          </Link>
          . Kliknij przycisk poniżej, aby zaakceptować zaproszenie i utworzyć
          konto.
        </Text>
        <Button style={button} href={confirmationUrl}>
          Zaakceptuj zaproszenie
        </Button>
        <Text style={footer}>
          Jeśli nie spodziewałeś się tego zaproszenia, możesz zignorować tę
          wiadomość.
        </Text>
        <Text style={{ fontSize: "11px", color: "#bbbbbb", marginTop: "32px", textAlign: "center" as const }}>
          <Link href="https://financeyou.pl/email/unsubscribe" style={{ color: "#bbbbbb", textDecoration: "underline" }}>Nie chcę otrzymywać tych wiadomości</Link>
        </Text>
      </Container>
    </Body>
  </Html>
)

export default InviteEmail

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
const link = { color: 'inherit', textDecoration: 'underline' }
const button = {
  backgroundColor: '#000000',
  color: '#ffffff',
  fontSize: '14px',
  borderRadius: '8px',
  padding: '12px 20px',
  textDecoration: 'none',
}
const footer = { fontSize: '12px', color: '#999999', margin: '30px 0 0' }
