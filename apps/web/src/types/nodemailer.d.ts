declare module "nodemailer" {
  export type TransportOptions = {
    host: string;
    port: number;
    secure?: boolean;
    auth?: { user: string; pass: string };
    requireTLS?: boolean;
    ignoreTLS?: boolean;
    tls?: { rejectUnauthorized?: boolean };
  };

  export type SendMailOptions = {
    from: string;
    to: string;
    subject: string;
    text: string;
    html?: string;
  };

  export type SentMessageInfo = {
    messageId?: string;
    accepted?: string[];
    rejected?: string[];
  };

  export type Transporter = {
    sendMail(options: SendMailOptions): Promise<SentMessageInfo>;
  };

  const nodemailer: {
    createTransport(options: TransportOptions): Transporter;
  };

  export default nodemailer;
}
