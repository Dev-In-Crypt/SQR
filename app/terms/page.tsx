const termsText = `These Terms and Conditions govern your access to and use of the Solidity Quick Review website, applications, reports, APIs, and related services (collectively, the "Service"). By accessing or using the Service, you agree to be bound by these Terms and Conditions. If you do not agree, you must not use the Service.

These Terms apply to all users of the Service, including developers, researchers, teams, organizations, contractors, wallet holders, and any other party accessing reports or interacting with the platform.

If you are using the Service on behalf of an entity, organization, or company, you represent and warrant that you have authority to bind that entity to these Terms. In that case, "you" and "your" refer to both you and that entity.

1. Description of the Service

Solidity Quick Review is an automated smart contract analysis service focused on Solidity code and related contract inputs. The Service is designed to help users review contract code, identify potential vulnerabilities, flag risky patterns, organize findings, and generate structured outputs for internal review and workflow support.

The Service may include, without limitation:

automated static analysis

analysis of verified contract addresses

analysis of submitted Solidity snippets or related source code inputs

structured findings and severity labels

report generation and report history

wallet-linked ownership or account features

report export, sharing, or publishing features

optional onchain receipts or blockchain-linked artifacts

future integrations, workflow features, and related tooling

The Service is intended as an engineering and review support tool. It is not a substitute for independent judgment, secure development practices, formal verification, manual review, red teaming, or professional smart contract audits.

We may add, remove, modify, suspend, or discontinue any feature, function, analysis method, integration, report format, or workflow at any time, with or without notice.

2. No Security Guarantee

The Service generates automated outputs. Those outputs are informational only.

The Service does not guarantee that all vulnerabilities, bugs, logic flaws, edge cases, economic risks, integration issues, gas inefficiencies, centralization concerns, upgradeability risks, access control issues, oracle risks, governance risks, or deployment hazards will be identified.

No automated analysis can fully evaluate all possible contract states, execution paths, cross-contract interactions, chain conditions, offchain dependencies, governance processes, tokenomics, upgrade behaviors, or operational risks. Even contracts that appear low risk or clean may contain serious defects, unknown attack surfaces, or latent vulnerabilities.

Use of the Service does not mean a contract is safe, production ready, compliant, audited, secure, reliable, exploit resistant, or fit for any particular purpose.

You acknowledge and agree that:

the Service may miss vulnerabilities

the Service may generate false positives

the Service may generate incomplete, simplified, or outdated findings

the Service may rely on assumptions or heuristics that do not match your intended use case

the Service may not reflect all dependencies, inherited contracts, linked libraries, external protocols, or runtime conditions

the Service may not detect issues introduced after analysis through redeployment, upgrades, configuration changes, governance changes, integrations, or third-party systems

You must not rely solely on the Service when making deployment, investment, integration, security, treasury, or operational decisions.

3. User Responsibility

You are solely responsible for your use of the Service and for any decisions made based on any report, output, signal, score, recommendation, or other information produced by the Service.

This includes sole responsibility for:

submitting code or contract addresses for review

determining whether you have the right to submit code or contract data

evaluating the completeness and correctness of analysis outputs

reviewing and interpreting all findings

deciding whether to deploy, upgrade, integrate, interact with, or rely on a contract

determining whether additional testing, internal review, or external audit is required

protecting your own users, systems, keys, tokens, treasuries, and infrastructure

backing up your own code, reports, and data

maintaining confidentiality of sensitive code or business logic

ensuring compliance with all laws, regulations, and contractual obligations applicable to your use

You are responsible for all consequences resulting from your use of the Service, including any loss, exploit, failed deployment, integration failure, legal claim, business interruption, or other damage related to code or systems you review, publish, deploy, or use.

4. Eligibility and Authority

You may use the Service only if you are legally capable of entering into a binding agreement under the laws applicable to you. If you are not legally permitted to use the Service, you must not use it.

If you use the Service on behalf of a company, DAO, protocol, fund, foundation, or any other organization, you represent and warrant that you are authorized to do so and that such organization agrees to be bound by these Terms.

We may refuse access to any person, wallet, entity, region, or use case at our discretion, to the extent permitted by law.

5. Wallet Authentication and Account-Linked Actions

Certain functions of the Service may require wallet authentication or cryptographic signature-based verification. This may include report ownership, report history, visibility settings, access to private resources, optional onchain receipts, or other account-linked functionality.

You are solely responsible for:

the security of your wallet

all signatures made from your wallet

verifying the contents of messages before signing

maintaining control of your own keys, devices, and wallet connections

any action initiated through your wallet, whether authorized by you or not, unless applicable law provides otherwise

We do not custody your wallet, private keys, seed phrases, or assets. We do not ask for your private keys. You must not share private keys or seed phrases with the Service.

If your wallet is compromised, lost, transferred, or accessed by another person, we are not responsible for any resulting loss of access, loss of reports, unauthorized visibility changes, or any other consequences.

6. Submitted Content and Source Materials

In order to use the Service, you may submit or cause the Service to process code, snippets, contract addresses, verified source code references, report metadata, labels, titles, descriptions, or related materials ("Submitted Content").

You represent and warrant that:

you have all rights, permissions, and authority necessary to submit the Submitted Content

your submission and our processing of that Submitted Content as part of the Service will not violate any law, regulation, agreement, confidentiality obligation, license, or third-party right

the Submitted Content does not contain anything unlawful, malicious, fraudulent, or designed to disrupt the Service or related systems

You retain your rights in your Submitted Content, subject to the rights you grant us under these Terms.

By submitting content to the Service, you grant us a limited, non-exclusive, worldwide, royalty-free license to host, process, analyze, store, reproduce, transform, display internally, and use that content as necessary to operate, secure, maintain, debug, improve, and provide the Service and related features.

This license is limited to operation of the Service and does not transfer ownership of your Submitted Content to us.

We are not obligated to review, monitor, verify, store, preserve, or return any Submitted Content.

7. Report Ownership, Access, and Visibility

Reports generated through the Service may be linked to the wallet address, session, or context that initiated the analysis.

Reports are private by default unless and until you explicitly take action to publish them, generate a share link, or otherwise disclose them through available product features.

You are solely responsible for:

deciding whether to keep a report private

sharing reports or share links with other persons

publishing or disclosing reports externally

managing any internal or external access to report data

using report outputs in a way consistent with your legal and confidentiality obligations

We do not guarantee that reports will remain permanently available, retrievable, unchanged, or compatible with future versions of the Service.

We may modify report formatting, report structure, metadata, storage model, retrieval methods, retention periods, or presentation layer over time.

8. No Professional Advice

The Service does not provide legal advice, financial advice, investment advice, fiduciary advice, accounting advice, tax advice, or professional security assurance.

Reports and findings are automated informational outputs only. They are not legal opinions, financial recommendations, audit opinions, formal certifications, or guarantees of contract safety.

Nothing in the Service should be interpreted as:

an endorsement of a contract, protocol, token, or deployment

an assurance that a contract complies with any legal or regulatory requirement

a representation that a contract is free from defects, vulnerabilities, or economic risk

a substitute for a professional manual audit or technical review

You remain fully responsible for obtaining any professional advice you consider necessary.

9. Smart Contract and Blockchain Risk Disclaimer

Blockchain systems are experimental, adversarial, and inherently risky. Smart contracts may fail or be exploited for reasons that are not apparent during code review. Risks may arise from contract logic, tooling, compiler behavior, upgradeability mechanisms, governance actions, key management, market conditions, MEV, validator behavior, oracle failures, bridge dependencies, price manipulation, economic design, or integrations with third-party systems.

By using the Service, you acknowledge and agree that:

digital assets may lose value or become inaccessible

transactions may be irreversible

contract interactions may cause permanent loss

reviewed code may still fail in production

a report does not eliminate protocol or deployment risk

past results do not predict future safety

The Service is not responsible for exploits, hacks, governance failures, liquidity events, oracle incidents, cross-chain failures, protocol insolvency, or any other blockchain-related event, whether or not the analyzed contract was reviewed through the Service.

10. Acceptable Use

You agree not to misuse the Service.

Prohibited conduct includes, without limitation:

attempting to disrupt, overload, disable, damage, reverse engineer, or degrade the Service

attempting to gain unauthorized access to systems, accounts, reports, data, APIs, or infrastructure

using bots, scrapers, or automation in a manner that harms the Service or circumvents product limits

submitting malicious code, payloads, or inputs intended to crash, corrupt, poison, probe, or exploit the Service

using the Service to facilitate unlawful conduct, fraud, theft, sanctions evasion, or abusive behavior

interfering with another user's use of the Service

misrepresenting your identity, authority, ownership, or rights in submitted material

using the Service in violation of any applicable law, regulation, court order, or contractual obligation

probing for vulnerabilities in the Service without authorization

copying, framing, mirroring, or reselling the Service without permission

using the Service to build a competing product through unauthorized extraction, systematic copying, or abusive access

We may investigate suspected misuse and may suspend, restrict, throttle, block, or terminate access at any time if we reasonably believe misuse, abuse, fraud, or risk to the Service has occurred.

11. Service Availability and Performance

The Service is provided on an "as is" and "as available" basis.

We do not guarantee that the Service will be uninterrupted, continuously available, error free, secure, timely, accurate, or compatible with your expectations, devices, wallet software, browser environment, infrastructure, or specific use case.

Downtime may occur for any reason, including:

maintenance

deployments

infrastructure outages

rate limiting

security events

third-party failures

network interruptions

software bugs

database issues

API provider failures

blockchain explorer failures

wallet connectivity problems

Service features may behave differently across environments, networks, devices, browsers, wallets, or versions of the platform.

We may impose limits on usage, storage, throughput, requests, report history, exports, or other functionality in order to protect the Service or maintain product performance.

12. Third-Party Dependencies

The Service may rely on third-party providers, infrastructure, software, data sources, or networks, including hosting providers, observability tools, RPC providers, blockchain explorers, content delivery services, analytics or logging tools, wallet providers, security services, and other dependencies.

We are not responsible for any outage, error, inaccuracy, unavailability, delay, incompatibility, data loss, or other failure caused by a third-party provider or external system.

Use of third-party services may be subject to separate terms and policies imposed by those third parties. Your interactions with such services are solely between you and the applicable provider.

13. Changes to the Service

We may change the Service at any time, including by adding, removing, modifying, replacing, restricting, or disabling any feature or workflow.

This includes changes to:

supported input types

supported networks

supported report formats

analysis methodology

severity models

storage model

history features

publishing or sharing features

wallet-linked functionality

API behavior

design, layout, and user interface

We are not obligated to continue any feature in its current form or at all.

We may release experimental, beta, limited, preview, or early access features. Such features may be incomplete, unstable, or later removed without notice.

14. Suspension and Termination

We may suspend, restrict, disable, or terminate your access to the Service, in whole or in part, immediately and without liability, if we believe:

you violated these Terms

your use creates legal, operational, reputational, or security risk

your use harms or threatens the Service, infrastructure, users, or third parties

your conduct is fraudulent, abusive, malicious, or unlawful

we are required to do so by law, regulation, subpoena, court order, sanctions, or other legal process

You may stop using the Service at any time.

Termination or suspension may result in loss of access to reports, account-linked history, settings, or related materials. We are not obligated to preserve or provide copies of any content after suspension or termination unless required by applicable law.

15. Intellectual Property

The Service, including its software, interface, branding, report layout, visual design, workflows, systems, models, processes, documentation, and all related materials, is owned by us or our licensors and is protected by intellectual property laws.

Except for the limited rights expressly granted in these Terms, no rights are granted to you by implication, estoppel, or otherwise.

You may not copy, modify, distribute, license, sublicense, rent, lease, resell, assign, frame, mirror, publicly display, or create derivative works of the Service except as expressly permitted by us in writing.

Nothing in these Terms prevents you from retaining rights in your own code or other Submitted Content, subject to the licenses granted under these Terms.

16. Feedback

If you provide suggestions, ideas, comments, bug reports, product requests, workflow proposals, or other feedback regarding the Service, you grant us a non-exclusive, worldwide, perpetual, irrevocable, royalty-free license to use, reproduce, modify, adapt, publish, implement, and otherwise exploit that feedback for any purpose without restriction or compensation.

17. Disclaimer of Warranties

TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE," WITH ALL FAULTS AND WITHOUT WARRANTIES OF ANY KIND.

WE EXPRESSLY DISCLAIM ALL WARRANTIES, WHETHER EXPRESS, IMPLIED, STATUTORY, OR OTHERWISE, INCLUDING ANY IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, NON-INFRINGEMENT, QUIET ENJOYMENT, ACCURACY, RELIABILITY, SECURITY, PERFORMANCE, AVAILABILITY, OR RESULTS OBTAINED FROM USE OF THE SERVICE.

WITHOUT LIMITING THE FOREGOING, WE DO NOT WARRANT THAT:

THE SERVICE WILL MEET YOUR REQUIREMENTS OR EXPECTATIONS

THE SERVICE WILL BE UNINTERRUPTED, TIMELY, SECURE, OR ERROR FREE

THE SERVICE WILL DETECT ALL VULNERABILITIES OR OTHER ISSUES

THE REPORTS OR FINDINGS WILL BE ACCURATE, COMPLETE, CURRENT, OR RELIABLE

ANY DEFECTS OR ERRORS WILL BE CORRECTED

THE SERVICE WILL BE COMPATIBLE WITH ANY PARTICULAR WALLET, NETWORK, BROWSER, EXPLORER, RPC PROVIDER, OR ENVIRONMENT

THE SERVICE OR ITS SERVERS ARE FREE OF HARMFUL COMPONENTS

ANY DATA, CONTENT, OR REPORTS WILL BE PRESERVED, RETAINED, OR AVAILABLE AT ANY PARTICULAR TIME

YOUR USE OF THE SERVICE IS AT YOUR SOLE RISK.

18. Limitation of Liability

TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL SOLIDITY QUICK REVIEW, ITS OPERATORS, AFFILIATES, LICENSORS, SERVICE PROVIDERS, CONTRACTORS, OR REPRESENTATIVES BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR FOR ANY LOSS OF PROFITS, REVENUE, BUSINESS, GOODWILL, CONTRACTS, OPPORTUNITY, DATA, TOKENS, DIGITAL ASSETS, OR OTHER INTANGIBLE LOSSES, ARISING OUT OF OR RELATED TO YOUR ACCESS TO, USE OF, INABILITY TO USE, OR RELIANCE ON THE SERVICE.

THIS LIMITATION APPLIES REGARDLESS OF THE THEORY OF LIABILITY, INCLUDING CONTRACT, TORT, NEGLIGENCE, STRICT LIABILITY, STATUTE, OR OTHERWISE, AND EVEN IF WE HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.

WITHOUT LIMITING THE FOREGOING, WE SHALL NOT BE LIABLE FOR:

EXPLOITS, HACKS, OR SECURITY INCIDENTS IN ANALYZED CONTRACTS

LOSS OF FUNDS, TOKENS, OR DIGITAL ASSETS

DEPLOYMENT FAILURES

GOVERNANCE FAILURES

THIRD-PARTY INTEGRATION FAILURES

BLOCKCHAIN OR NETWORK EVENTS

ORACLE FAILURES

BRIDGE FAILURES

COMPILER ISSUES

UPGRADE OR CONFIGURATION ERRORS

INACCURATE, INCOMPLETE, OR MISINTERPRETED REPORTS

LOSS OR DELETION OF REPORTS OR HISTORY

UNAUTHORIZED ACCESS TO REPORTS CAUSED BY YOUR ACTIONS OR SHARE DECISIONS

TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, OUR AGGREGATE LIABILITY FOR ALL CLAIMS ARISING OUT OF OR RELATING TO THE SERVICE SHALL NOT EXCEED THE GREATER OF:

ONE HUNDRED UNITED STATES DOLLARS (US $100), OR

THE TOTAL AMOUNT PAID BY YOU TO US FOR THE SERVICE IN THE SIX MONTHS PRECEDING THE EVENT GIVING RISE TO THE CLAIM

SOME JURISDICTIONS DO NOT ALLOW CERTAIN LIMITATIONS OR EXCLUSIONS, SO PORTIONS OF THIS SECTION MAY NOT APPLY TO YOU TO THE EXTENT PROHIBITED BY LAW.

19. Indemnification

You agree to defend, indemnify, and hold harmless Solidity Quick Review, its operators, affiliates, licensors, service providers, contractors, and representatives from and against any claims, actions, proceedings, liabilities, losses, damages, judgments, settlements, penalties, fines, costs, and expenses, including reasonable legal fees, arising out of or related to:

your use or misuse of the Service

your Submitted Content

your breach of these Terms

your violation of any law, regulation, or third-party right

your deployment, publication, distribution, or use of any analyzed contract or related system

any dispute between you and a third party related to your use of the Service or any report generated by it

We reserve the right, at our own expense, to assume the exclusive defense and control of any matter otherwise subject to indemnification by you, and you agree to cooperate with our defense of such matter.

20. Data Retention and Deletion

We may retain reports, metadata, logs, backups, diagnostic records, wallet-linked associations, and related materials for as long as we determine necessary to operate, secure, improve, support, or enforce the Service, subject to applicable law and our internal retention practices.

We are not obligated to store any report or content for any minimum period unless required by law. Reports, metadata, or history records may be removed, archived, anonymized, or deleted at any time.

You are responsible for keeping your own records and backups of anything important to you.

21. Confidentiality and Sensitive Material

The Service is not intended to serve as a secure vault or confidential code escrow unless explicitly stated otherwise.

You should not submit highly sensitive, proprietary, embargoed, classified, regulated, or mission-critical material unless you understand and accept the operational risks associated with processing data through an online service.

Even where reports are private by default, no online platform can guarantee absolute confidentiality or absolute security.

22. Export Control, Sanctions, and Restricted Use

You may not use the Service if doing so would violate applicable export control laws, sanctions laws, or trade restrictions. You represent and warrant that you are not located in, ordinarily resident in, or using the Service from a jurisdiction where such use is prohibited by applicable law, and that you are not a person or entity subject to applicable sanctions or export restrictions that would prohibit your use of the Service.

You may not use the Service in connection with unlawful weapons activity, malicious cyber activity, terrorism financing, sanctions evasion, or any other prohibited activity.

23. Beta Features and Forward-Looking Roadmap Items

We may identify certain features as beta, preview, experimental, early access, roadmap, or not yet generally available. Such items are provided for informational or testing purposes only.

We make no promise that any roadmap item, concept, or preview feature will be delivered, delivered on time, or delivered in any particular form.

Any discussion of future functionality is illustrative only and should not be relied upon as a commitment.

24. Modifications to These Terms

We may revise these Terms from time to time. If we do, we may update the text on this page, revise the effective date, or otherwise indicate that the Terms have changed.

Your continued use of the Service after revised Terms become effective constitutes your acceptance of the updated Terms.

If you do not agree to the revised Terms, you must stop using the Service.

25. Governing Law and Venue

These Terms, and any dispute, claim, or controversy arising out of or relating to these Terms or the Service, shall be governed by and construed in accordance with the laws determined by the operator of the Service, without regard to conflict of law rules, except where applicable law requires otherwise.

You agree that any dispute arising out of or relating to these Terms or the Service shall be brought exclusively in the courts selected by the operator of the Service, unless applicable law requires another forum.

Nothing in this section prevents us from seeking injunctive or equitable relief in any competent jurisdiction to protect the Service, intellectual property, confidential information, or security interests.

26. Severability

If any provision of these Terms is held invalid, unlawful, or unenforceable, the remaining provisions will remain in full force and effect to the maximum extent permitted by law.

Any invalid or unenforceable provision shall be interpreted, limited, or replaced to the minimum extent necessary so that these Terms otherwise remain enforceable and reflect the original intent as closely as possible.

27. No Waiver

Our failure to enforce any provision of these Terms shall not constitute a waiver of that provision or any other provision.

Any waiver must be express and in writing to be effective.

28. Entire Agreement

These Terms constitute the entire agreement between you and Solidity Quick Review regarding the Service, except to the extent additional policies, product-specific terms, or written agreements expressly apply.

These Terms supersede any prior or contemporaneous understandings, communications, or proposals relating to the Service, whether oral or written.

29. Contact

For questions regarding these Terms or the Service, you may contact:

sqrsupport@gmail.com`;

const termsParagraphs = termsText.split("\n\n");

export default function TermsPage() {
  return (
    <section className="stack page-container">
      <div className="card stack page-hero-card legal-page">
        <div className="section-eyebrow">Legal</div>
        <h1>Terms and Conditions</h1>
        <p className="muted page-intro">
          These terms govern access to the product, use of generated reports, account-linked actions, and the limits of
          automated security review.
        </p>
        <div className="stack legal-copy legal-copy-dense">
          {termsParagraphs.map((paragraph) => (
            <p className="muted" key={paragraph}>
              {paragraph}
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}
