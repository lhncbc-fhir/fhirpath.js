# The `htmlChecks()` function

`htmlChecks()` implements the FHIR-specific FHIRPath function described in
[fhirpath.html#fn-htmlChecks](https://build.fhir.org/fhirpath.html#fn-htmlChecks):

> When invoked on a single xhtml element, the function returns true if the
> rules around HTML usage are met, and false if they are not. If invoked on
> items of type 'string', the contents of the string are parsed as the content
> of a div and the function returns false if the string does not parse as valid
> HTML or fails the rules around HTML usage. The return value is empty on any
> other kind of element or if invoked on a collection of elements.

The "rules around HTML usage" are defined in
[narrative.html#rules](https://build.fhir.org/narrative.html#rules).

## Input handling

| Input | Behavior |
|---|---|
| A single `FHIR.xhtml` element (e.g. `Narrative.div` with a model) | Checked as a document whose single root element must be a `div` |
| A single `FHIR.string` or `System.String` | Checked as the *content* of a `div` |
| A single element of a type derived from `string` (`code`, `id`, `markdown`) | Checked as the *content* of a `div` |
| A single element of a `uri`-derived type (`uri`, `url`, `canonical`, `oid`, `uuid`) | Returns an empty collection |
| Any other element type | Returns an empty collection |
| A collection of more than one item, or an empty collection | Returns an empty collection |

Note that without a `model`, a `Narrative.div` value has no FHIR type
information and is therefore treated as a `System.String`, i.e. as div content.

The spec's "items of type 'string'" is read with the usual FHIRPath subtype
semantics, so the types derived from `string` are included. In every supported
model (`dstu2`, `stu3`, `r4`, `r5`) those are exactly `code`, `id` and
`markdown` — `Patient.gender is FHIR.string` evaluates to `true`, and
`Patient.gender.htmlChecks()` therefore checks the value as div content.

The `uri`-derived types are not derived from `string` and return an empty
collection. `xhtml` is not derived from `string` either (its parent is
`Element`), so the two overloads stay disjoint.

The spec describes the `string` overload as parsing "as valid HTML", but the
string is defined as "the content of a div", i.e. narrative content, and
narrative content is XHTML ("the XHTML is contained in general XML"). A single
strict XHTML rule set is therefore applied to both overloads.

## Rules enforced

### FHIR narrative rules

- Only the elements and attributes allowed by the narrative rules may be used.
  The lists follow the chapters of HTML 4.0 identified by the narrative rules.
- Image maps are rejected because they belong to chapter 13, outside the
  permitted chapters 7-11 and 15: the elements `map` and `area`, and the `img`
  attributes `usemap` and `ismap` that refer to them. Images themselves stay
  allowed, because the narrative rules name them explicitly.
- An `a` element may carry `name` or `href` (or both); these are the only
  anchor-specific attributes, and neither of them is required. Permitted
  global formatting attributes may also be present.
- `width` is accepted on the table elements and on `img` only; it is not a
  global HTML 4.0 attribute. The other table attributes (`abbr`, `align`,
  `axis`, `char`, `charoff`, `colspan`, `headers`, `rowspan`, `scope`, `span`,
  `valign`) are accepted on any element, as they are in the `txt-1` XPath.
- Scripts, forms, objects, frames, iframes, `head`, `body`, `base`, `link`,
  `xlink:*`, deprecated elements and event-related attributes (e.g. `onClick`)
  are rejected, because they are not in the allow lists.
- The `div` SHALL have some non-whitespace content — text, or an `<img>` that
  has a `src` attribute, which is what the `txt-2` XPath requires
  (`descendant::text()[normalize-space(.)!=''] or descendant::h:img[@src]`).
  A character reference counts as content even when it denotes a whitespace
  character (see the interpretation notes below). This rule is applied for
  every FHIR version, because it is `txt-2`, whose FHIRPath expression is
  `htmlChecks()` in STU3, R4 and R5.
- There is no support for HTML entities such as `&nbsp;` or `&copy;`; Unicode
  characters or numeric character references must be used instead
  (`&#160;` substitutes for `&nbsp;`).
- Processing instructions such as `<?xml ...?>` are not allowed.
- A default namespace declaration is optional, but when one is present it may
  only declare the XHTML namespace, `http://www.w3.org/1999/xhtml` — on the
  root `div` as well as on any descendant that redeclares it. Without this
  rule the element allow list would be applied to elements that are not XHTML
  at all, e.g. in
  `<div xmlns="http://www.w3.org/1999/xhtml"><p xmlns="urn:x">t</p></div>`.
  The URI is compared literally: neither case nor whitespace is normalized,
  and a value spelled with character references
  (`http&#58;//www.w3.org/1999/xhtml`) is not recognized. An empty declaration
  (`xmlns=""`) undeclares the default namespace and is rejected as well.
- For an `xhtml` element, the single root element must be a `div`, and nothing
  but whitespace may appear outside it — in JSON "the characters between the
  first `>` and the last `<` delimiters is the content of the `<div>` element".

### XML well-formedness

Narrative "is contained in general XML", so the content must also be
well-formed XML:

- Every element must be closed (`<br></br>`) or self-closed (`<br/>`). There is
  no HTML void-element shorthand, so `<br>` is rejected.
- Every attribute must have a value, and every value must be quoted;
  `<td nowrap>` and `<p class=c>` are both rejected.
- Attributes must be separated by whitespace; `<p title="a"class="c">` is
  rejected.
- A raw `<` is not allowed in an attribute value.
- Only legal XML characters may appear: C0 control characters other than tab,
  LF and CR, unpaired surrogates and U+FFFE/U+FFFF are rejected, both as raw
  characters and as numeric character references. This applies inside tags as
  well: only space, tab, CR and LF separate a name from what follows it, so a
  raw control character between a tag name and an attribute is rejected rather
  than treated as a separator.
- Comments may not contain `--`, and a comment body may not end with `-`.
- A literal `]]>` is not allowed in character data; `]]&gt;` must be used.
- DOCTYPE declarations and CDATA sections are not allowed.
- Namespace prefixes are not supported. A default `xmlns` declaration, which
  is how FHIR narrative declares the XHTML namespace, is accepted on any
  element as long as it declares the XHTML namespace (see the narrative rules
  above); `xmlns:<prefix>` and prefixed attribute names such as `xml:lang`,
  `xml:space` and `xml:id` are rejected. Rejecting the prefixed declarations
  is also what bounds the duplicate attribute scan in `checkHtml()`: an
  unbounded family such as `xmlns:a1`, `xmlns:a2`, ... would let a single
  start tag carry an arbitrary number of distinct accepted attributes and turn
  that scan quadratic.

Element and attribute names are compared case-sensitively, as XHTML requires.

## The `htmlchecks()` alias

The STU3 `Narrative.div` invariants `txt-1` and `txt-2` spell the function
`htmlchecks()`, whereas R4 and R5 use `htmlChecks()`. FHIRPath is
case-sensitive, so the STU3 spelling is registered as an alias in order to keep
those invariants evaluable. This is the only alias of its kind — FHIRPath
function names are **not** case-insensitive in general.

## Interpretation of the rules

`htmlChecks()` is the FHIRPath expression of the `Narrative.div` invariants
themselves (`txt-1` and `txt-2` in STU3, R4 and R5), so the only concrete
definitions of the rules are the prose in `narrative.html` and
the [R4 XPath](https://hl7.org/fhir/R4/narrative.profile.json.html). Where
these leave room, the choices made here are the following.

### Elements and attributes deliberately not accepted

Beyond the names the narrative rules exclude outright, these are not accepted
either:

- The anchor attributes `shape` and `coords`, which go with the image maps of
  chapter 13 that are already rejected (`map`, `area`, `img.usemap`,
  `img.ismap`).
- The remaining anchor attributes of chapter 12, `charset`, `type`,
  `hreflang`, `rel` and `rev`: the narrative rules name `<a>` elements "either
  name or href", and those two are the only anchor attributes accepted here.
- `pre.space`: a bare `space` attribute exists neither in HTML 4.0 nor in the
  `txt-1` XPath, and the prefixed spelling `xml:space` is rejected as a
  prefixed name, so neither form is accepted.

### Stricter than the literal R4 `txt-1` XPath

- Attribute names the XPath permits that are never accepted here: `bgcolor`,
  `cellhalign`, `cellvalign`, `charset`, `compact`, `coords`, `hreflang`,
  `hspace`, `rel`, `rev`, `shape`, `start`, `type`, `value`, `vspace`. All are
  deprecated in HTML 4.0 or belong to chapters outside the permitted ones.
- The XPath tests attribute names document-wide, so it permits any of them on
  any element. These are accepted only on the elements they belong to: `alt`,
  `border`, `cellpadding`, `cellspacing`, `cite`, `frame`, `height`, `href`,
  `longdesc`, `name`, `nowrap`, `rules`, `src`, `summary`, `width`. The
  remaining table attributes (`abbr`, `align`, `axis`, `char`, `charoff`,
  `colspan`, `headers`, `rowspan`, `scope`, `span`, `valign`) stay global, so
  `<p rowspan="2">` is accepted.

Note that the XPath also rejects `xml:lang` and `xml:space` (it matches
attributes with `name(.)`, which yields the prefixed name), so it cannot be
read as normative-precise either. It says nothing at all about `xmlns`:
namespace declarations are not attributes in the XPath data model, so `@*`
never selects them.

### More permissive than the literal R4 `txt-1` XPath

- The elements `address`, `bdo` and `kbd` are accepted. They belong to the
  permitted chapters 7, 8 and 9, but the XPath's element list does not
  enumerate them.
- A character reference counts as `div` content even when it denotes a
  whitespace character (`&#32;`, `&#9;`, `&#10;`, `&#13;`), whereas
  `normalize-space()` in the `txt-2` XPath would ignore it. Escaping a
  character is taken as a statement that it is significant.

## Deliberate non-goals

- **An `<a>` element is not required to carry `name` or `href`.** The `txt-1`
  human text, "`<a>` elements (either name or href)", enumerates the permitted
  elements and attributes, so it is read as an allow list rather than as a
  requirement — as it is by the `txt-1` XPath. Narratives generated by the
  FHIR publisher rely on this: the R4 and R5 `observation-example` narratives
  contain `<p><b>subject</b>: <a>Patient/example</a></p>` (see
  `test/resources/r4/observation-example.json`).
- **XHTML content models are not enforced.** `<p><div>x</div></p>`, nested
  `<a>` elements and an orphan `<td>` are all accepted: `txt-1` and `txt-2`
  constrain the element and attribute names and the content of the `div`, not
  how the elements are nested, and their XPaths test no nesting either.
- **The XHTML namespace declaration is not required** on the root `div`.
  `narrative.html` does require the narrative to be in the XHTML namespace —
  which in JSON means an `xmlns` on the `div` — but a narrative that declares
  no namespace at all is still accepted. A declaration that names *another*
  namespace is rejected, see the narrative rules above.
- **`style` attribute values are not inspected.** The narrative rules forbid
  external stylesheet references, and a `url(...)` inside a `style` attribute
  is arguably one, but `txt-1` constrains attribute names, not their values.
- **`href` and `src` values are not inspected.** A `javascript:` URL, or a
  link to external content, passes the checks; see the security note below.

## Security

`htmlChecks()` validates a narrative; it is **not** an HTML sanitizer and must
not be relied upon as a defense against XSS. See the security note in
[narrative.html](https://build.fhir.org/narrative.html#rules).
