/**
 * Shown when /api/chat isn't reachable.
 *
 * The overwhelmingly common cause is running `next dev` locally, where there is
 * no CloudFront distribution and therefore no /api/* behaviour routing to the
 * Lambda. Saying so directly saves the reader from debugging their AWS account
 * over what is really just a local dev limitation.
 */
export default function MisconfiguredBanner({ detail }: { detail?: string }) {
  return (
    <div className="mx-auto max-w-3xl rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm">
      <p className="font-semibold text-amber-900">The chat API isn&apos;t reachable.</p>
      <p className="mt-1 text-amber-800">
        The UI is served as a static export and calls <code>/api/chat</code> on the same
        origin, which only exists once CloudFront is deployed.
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-amber-800">
        <li>
          Running <code>next dev</code>? That&apos;s expected - open the CloudFront URL
          from the stack outputs instead.
        </li>
        <li>
          Deployed already? Check the Lambda logs, then run{' '}
          <code>./test-bedrock.sh</code> from the repository root.
        </li>
      </ul>
      {detail && (
        <p className="mt-2 font-mono text-xs text-amber-700 break-words">{detail}</p>
      )}
    </div>
  );
}
