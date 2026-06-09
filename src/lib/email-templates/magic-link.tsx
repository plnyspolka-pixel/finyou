import * as React from 'react'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Img,
  Html,
  Preview,
  Text,
} from '@react-email/components'

interface MagicLinkEmailProps {
  siteName: string
  confirmationUrl: string
}

export const MagicLinkEmail = ({
  siteName,
  confirmationUrl,
}: MagicLinkEmailProps) => (
  <Html lang="pl" dir="ltr">
    <Head />
    <Preview>Twój link do logowania w {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img src="https://financeyou.pl/__l5e/assets-v1/58b0a934-fc94-423a-95ed-aca9497ecd99/favicon.png" width="64" height="64" alt="FinanceYou" style={{ display: "block", margin: "0 auto 16px" }} />
        <Heading style={h1}>Twój link do logowania</Heading>
        <Text style={text}>
          Kliknij przycisk poniżej, aby zalogować się do {siteName}. Link wygaśnie
          wkrótce.
        </Text>
        <Button style={button} href={confirmationUrl}>
          Zaloguj się
        </Button>
        <Text style={footer}>
          Jeśli nie prosiłeś o link logowania, możesz zignorować tę wiadomość.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default MagicLinkEmail

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
const button = {
  backgroundColor: '#000000',
  color: '#ffffff',
  fontSize: '14px',
  borderRadius: '8px',
  padding: '12px 20px',
  textDecoration: 'none',
}
const footer = { fontSize: '12px', color: '#999999', margin: '30px 0 0' }
