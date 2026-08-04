/**
 * Renders a JSON-LD structured-data block.
 *
 * `JSON.stringify` output is safe inside a <script> except for `<`, which
 * could close the tag early ("</script>") — escaping it to the unicode form keeps the
 * JSON semantically identical while making injection impossible.
 */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
