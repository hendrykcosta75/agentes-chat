import type { LegalDocument } from "./types";

export const privacyEn: LegalDocument = {
  title: "Privacy Policy",
  summary: "What we collect, what agents send where, who can see your workspace, and the rights you have.",
  updated: "2026-11-13",
  sections: [
    {
      id: "overview",
      heading: "1. Overview",
      blocks: [
        'CODARI GLOBAL, LLC, a Wyoming limited liability company doing business as agentes.chat ("agentes.chat", "we"), operates agentes.chat: a workspace where people and AI agents work together, available on the web, as a Mac app and as a phone app (the "Service"). This policy distinguishes two roles:',
        {
          list: [
            "For **account data**, the information people give us to create and use an account, we are the data controller.",
            "For **Workspace Content**, everything a workspace's people and agents put into or produce in it, we are a data processor acting on the workspace's instructions. The workspace is the controller, meaning the person or entity that created it or on whose behalf it was created.",
          ],
        },
      ],
    },
    {
      id: "data-we-collect",
      heading: "2. Data we collect as controller",
      blocks: [
        {
          list: [
            "**Account data:** name, email address, password hash, profile photo, language and time zone. If you sign in with Google, Apple or GitHub, we receive your name, email address and the account identifier from that provider, never its password.",
            "**Workspace data:** the workspace's name, members, roles and invitations.",
            "**Billing data:** for a workspace with an agentes.chat plan, the name, email address, billing address and tax ID of the person who pays, the plan, and its invoices and payments. Payments are processed by Stripe, which handles the card details: they never reach us.",
            "**Usage and log data:** IP addresses, browser and device, sign-in sessions, security events, API requests, and the record of each model call (model, tokens and cost, with the workspace and agent it belongs to), which we keep to enforce budgets and show usage. When something breaks, we record the error, without message content, to fix it.",
            "**Devices:** for the phone app, the push notification token of each device you sign in on. For connected computers and the Mac app, the computer's name, operating system and app version.",
            "**Waiting list:** the email address and language you give us on agentes.chat, and whether you confirmed it.",
            "**Site analytics:** on agentes.chat (the public site, not the workspace), the pages viewed, the referring site, the device type and an approximate location derived from the IP address, collected with Himetrica.",
          ],
        },
      ],
    },
    {
      id: "how-we-use",
      heading: "3. How we use account data",
      blocks: [
        "To provide and secure the Service (including detecting and stopping abuse), bill for plans, apply budgets and limits, respond to support requests, meet legal obligations, and send service messages such as email confirmations, invitations, password resets, approval requests and notifications you turned on. We email the waiting list only to confirm the address and to invite you.",
        "We do not sell personal data, do not use Workspace Content to train machine-learning models, and do not permit our subprocessors to do so.",
      ],
    },
    {
      id: "workspace-content",
      heading: "4. Workspace Content, processed on behalf of workspaces",
      blocks: [
        "Workspace Content includes messages in channels, threads and direct messages, files in the Drive and wiki pages. It also includes tasks, routines, calendar events and approvals, the instructions, settings and memory of agents, what agents write and do, and the data agents read through the connectors, databases and computers the workspace connects. We process it only to run the workspace and its agents as the workspace configures them, to show it to the workspace's members, to send the notifications they ask for, and to provide support.",
        "Workspace Content belongs to the workspace: members see what its channels and permissions allow, and its owners and admins manage it. Workspace owners and administrators can see every channel, task and wiki page, private ones included. They can't read direct messages between other people. Messages you posted stay in the workspace after you leave it or delete your account, unless the workspace deletes them.",
      ],
    },
    {
      id: "agents",
      heading: "5. How agents process Workspace Content",
      blocks: [
        "Agents are AI models that read and act inside the workspace. Workspace Content leaves our servers in the following cases, and only in them:",
        {
          list: [
            "**Between devices and our servers.** Everything sent between our servers and the browsers, apps and computers that connect to them, Workspace Content included, passes through our network provider, which protects the Service from attacks. To do that, the network provider decrypts this traffic at its data center nearest to each device, and handles it on our behalf.",
            "**Answering.** When an agent works, it sends the context it needs (the workspace's context, the agent's instructions, the conversation, relevant memory and the results of its tools) to the model provider chosen for that agent. With an API key the workspace added, the call is made under the workspace's own account and agreement with that provider. With an AI plan, such as Claude or ChatGPT, connected to an agent, the agent works under the account of the person who connected the plan and under the provider's terms.",
            "**Deciding who replies.** A routing model reads a new message, the names and roles of the workspace's agents, and recent conversation to decide which agent, if any, should reply. It runs at TypeSafe or, as a fallback, at the workspace's model provider. Routing never grants an agent any permission.",
            "**Memory.** Agents keep memory from conversations (summaries, facts and lessons) so they improve over time. Some judgments about memory (whether something is worth keeping, or conflicts with what an agent already knows) are made by TypeSafe. Memory can be seen and removed in the agent's page, and it is deleted with the workspace.",
            "**Search.** To find related messages and documents, text may be turned into vectors (embeddings) by Voyage AI.",
            "**Connectors.** When the workspace connects a service (such as GitHub, Google, Linear, Sentry, an email inbox or any MCP server), we store its access tokens encrypted and read or write that service only within the scopes the workspace gave each agent. The connected service processes that data under its own terms. Connections to Gmail and Outlook inboxes, and to Google Drive, Google Calendar, Google Sheets, Google Docs, Slack, Microsoft Teams, OneDrive, HubSpot, Salesforce, Zendesk, Asana, Figma, Intercom, Dropbox, Square, Instagram, Facebook, LinkedIn, YouTube, Pinterest, Reddit and WhatsApp, go through Composio, which processes what agents read and write there.",
            "**Databases.** Database connections are read-only. Credentials are stored encrypted and each query is checked before it runs.",
            "**Connected computers.** When someone connects a computer, agents can run commands and use a browser there, within the folders and permissions set on that computer. The live view of an agent's browser passes through our network provider and through our servers' memory, and is not recorded. A summary of the steps the agent took (such as addresses visited and actions) is kept with its work so the team can see what it did.",
            "**The workspace's computer.** On agentes.chat Cloud, a workspace's agents work on a computer we run for that workspace, on our servers or a hosting provider's, in the European Union or the United States. We count how much data each agent's browser, AI tools and other programs send and receive there, per day. The computer is wiped after the workspace's agentes.chat plan ends, as the Terms of Use describe.",
          ],
        },
        "Actions that are hard to undo (such as merging code, deploying or sending on someone's behalf) become an approval request for a person before they happen. Text that comes from outside the workspace (web pages, emails, files) is marked as untrusted before an agent reads it.",
      ],
    },
    {
      id: "staff-access",
      heading: "6. When agentes.chat staff can see Workspace Content",
      blocks: [
        "We do not browse workspaces. A person at agentes.chat can see Workspace Content only:",
        {
          list: [
            "**At your request,** to help with a support request, and only as far as the request needs.",
            "**For trust and safety,** to investigate suspected abuse, fraud, unlawful content or a threat to the security of the Service, or to enforce our Terms of Use.",
            "**When the law requires it.**",
          ],
        },
        "The people who operate our infrastructure can reach the servers and databases that store Workspace Content. They use that access only to keep the Service running, such as diagnosing faults and restoring backups, or to meet a legal obligation. None of these paths is used to build profiles, advertising or training data.",
      ],
    },
    {
      id: "retention",
      heading: "7. Retention",
      blocks: [
        {
          list: [
            "**Account data:** for the life of the account. When you delete your account in the app, it is signed out everywhere at once and removed 7 days later, unless you restore it before then, and leaves our backups within 30 days after that, except records we must keep by law. Any workspace in which you were the only member closes at the same time, and its content is deleted 7 days later as described next. The workspaces you were in keep your name and email address in their audit logs for as long as each of them exists.",
            "**Workspace Content:** for the life of the workspace, and earlier when the workspace deletes specific content. When a workspace's agentes.chat plan ends, its content stays available for 90 days and is then deleted. When an owner deletes a workspace, it closes for everyone at once and its content is deleted 7 days later, unless an owner restores it before then, and leaves our backups within 30 days after that, except content we must keep by law or as a record of abuse (below).",
            "**Logs:** request and security logs for up to 90 days. Model usage records (tokens and cost) for the life of the workspace, because budgets and usage reports depend on them.",
            "**Billing data:** while you pay for a workspace, and after that for as long as tax and accounting law requires.",
            "**Waiting list:** until you are invited and for 12 months after, or until you ask us to remove you.",
            "**Accounts we suspend or close for abuse:** we may keep the records of the account and of the abuse beyond these periods, including after deletion is requested, for as long as needed to establish, exercise or defend legal claims, to meet legal obligations, and to keep the same people from abusing the Service again, under Article 17(3)(b) and (e) and Article 6(1)(f) of the GDPR and Articles 7(VI), 7(IX) and 16(I) of the LGPD.",
          ],
        },
      ],
    },
    {
      id: "security",
      heading: "8. Security",
      blocks: [
        "Data is encrypted in transit (TLS) and at rest. Model provider keys, connector tokens and database credentials are additionally encrypted with per-workspace envelope encryption and are never sent back to the browser or the apps. Access to production systems is restricted and logged. If we learn of a personal-data breach, we will notify affected workspaces without undue delay and within the timelines the GDPR and LGPD require.",
      ],
    },
    {
      id: "transfers",
      heading: "9. International transfers",
      blocks: [
        "Our application and its database run in the United States, and the providers named in this policy process data in the United States. The workspaces' computers run in the European Union or the United States, and our network provider handles traffic at its data center nearest to each device, in the United States or elsewhere. Where personal data subject to the GDPR or UK GDPR is transferred to a third country, we rely on the European Commission's Standard Contractual Clauses and the UK Addendum. For data subject to the LGPD, we rely on the contractual safeguards of Article 33.",
      ],
    },
    {
      id: "apps",
      heading: "10. Phone and Mac apps",
      blocks: [
        "The phone app sends notifications through Apple and Google. A notification may show the name of who wrote and the beginning of the message, and you choose which notifications you get. The Mac app and connected computers keep their sign-in on the device. Deleting your account (also available in the apps) signs every device out.",
      ],
    },
    {
      id: "gdpr",
      heading: "11. Your rights under the GDPR",
      blocks: [
        "If you are in the EEA or the UK, you may request access, rectification, erasure, restriction and portability, and object to processing, and you may lodge a complaint with your supervisory authority. For account data, contact us directly. You can also correct your profile and delete your account yourself in the app. For personal data in Workspace Content, contact the owners or admins of the workspace, which controls it. We will refer requests we receive to that workspace and assist it as processor.",
      ],
    },
    {
      id: "lgpd",
      heading: "12. Your rights under the LGPD",
      blocks: [
        "If you are in Brazil, the Lei Geral de Proteção de Dados gives you the corresponding rights: confirmation of processing, access, correction, anonymization, blocking or deletion, portability, information about sharing, and withdrawal of consent. Requests go through the same channels as Section 11, and you may petition the ANPD. Our privacy team, reachable at privacy@agentes.chat, acts as our point of contact (encarregado).",
      ],
    },
    {
      id: "dpa",
      heading: "13. Data Processing Addendum",
      blocks: [
        "A DPA covering our processing of Workspace Content, including the Standard Contractual Clauses and LGPD processing terms, is available to every workspace. Request it at legal@agentes.chat.",
      ],
    },
    {
      id: "cookies",
      heading: "14. Cookies and local storage",
      blocks: [
        "The workspace uses only the cookies and local storage needed to keep you signed in, protect forms, and remember preferences such as theme and language. The public site agentes.chat remembers the language you chose and uses Himetrica analytics (Section 2). We do not use advertising or cross-site tracking cookies.",
      ],
    },
    {
      id: "children",
      heading: "15. Children",
      blocks: [
        "The Service is a work tool for adults. It is not directed to anyone under 18, and we do not knowingly collect their personal data. If you believe a minor has given us personal data, write to privacy@agentes.chat and we will delete it.",
      ],
    },
    {
      id: "changes",
      heading: "16. Changes to this policy",
      blocks: [
        "We may update this policy. Material changes will be announced by email or in the app before they take effect. The current version always lives at this page. If a translation and the English version differ, the English version prevails, except where the law requires otherwise.",
      ],
    },
    {
      id: "contact",
      heading: "17. Contact",
      blocks: [
        "CODARI GLOBAL, LLC, doing business as agentes.chat. Notices: 7345 W Sand Lake Rd Ste 210, Office 4592, Orlando, FL 32819, USA · privacy@agentes.chat. EU, UK and Brazil data-protection inquiries reach our privacy team at the same address. For anything else, write to hello@agentes.chat.",
      ],
    },
  ],
};
