const fhirpath = require('../src/fhirpath');
const htmlChecks = require('../src/html-checks');
const { loadResource, getFHIRModel } = require('./test_utils');

// This suite owns the matrix of narrative rules, which it exercises through
// _checkHtml(), the only entry point that can tell the `xhtml` and `string`
// overloads apart, plus the behavior that is specific to this API (input
// selection, the thrown error, the allow-list accessors).
// test/cases/htmlChecks.yaml complements it through the public API: the
// model-driven `xhtml` overload, a sample of the `string` overload, the STU3
// alias, and the inputs that yield an empty collection. A rule that is
// already pinned here does not need a case there as well.

const r4 = getFHIRModel('r4');

// Treats the input as the content of a div (the `string` overload).
const check = (html) => htmlChecks._checkHtml(html, true);
// Treats the input as a document whose root element must be a div (the
// `xhtml` overload).
const checkDoc = (html) => htmlChecks._checkHtml(html, false);

const patient = () =>
  loadResource(__dirname + '/resources/r4/patient-example.json');

// The element and attribute allow lists used for FHIR narrative XHTML. These
// guard the three Sets in src/html-checks.js against silent drift.
const EXPECTED_ELEMENTS = [
  'p', 'br', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'span', 'b',
  'em', 'i', 'strong', 'small', 'big', 'tt', 'dfn', 'q', 'var', 'abbr',
  'acronym', 'cite', 'blockquote', 'hr', 'address', 'bdo', 'kbd', 'sub',
  'sup', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'pre', 'table', 'caption',
  'colgroup', 'col', 'thead', 'tr', 'tfoot', 'tbody', 'th', 'td', 'code',
  'samp', 'img'
];

const EXPECTED_GLOBAL_ATTRS = [
  'title', 'style', 'class', 'id', 'lang', 'dir', 'accesskey', 'tabindex',
  'xmlns',
  'span', 'align', 'valign', 'char', 'charoff', 'abbr', 'axis',
  'headers', 'scope', 'rowspan', 'colspan'
];

const EXPECTED_ELEMENT_ATTRS = [
  'a.href', 'a.name', 'img.src', 'img.border', 'img.alt', 'img.longdesc',
  'img.height', 'img.width', 'blockquote.cite', 'q.cite',
  'table.summary', 'table.width', 'table.border', 'table.frame',
  'table.rules', 'table.cellspacing', 'table.cellpadding', 'col.width',
  'colgroup.width', 'th.width', 'td.width', 'td.nowrap'
];

// The only namespace a narrative may declare.
const XHTML_NS = 'http://www.w3.org/1999/xhtml';


describe('htmlChecks()', () => {

  describe('input selection', () => {

    it('should treat an untyped narrative as a string', () => {
      // Without a model the `div` element is a System.String, so its contents
      // are checked as the content of a div (a div inside a div is allowed).
      expect(
        fhirpath.evaluate(patient(), 'Patient.text.`div`.htmlChecks()')
      ).toEqual([true]);
    });


    it('should treat Narrative.div as xhtml in every supported model', () => {
      // `<p>x</p>` is valid *content* of a div, but not a valid document: the
      // root element must be a div. It is therefore rejected only while `div`
      // resolves to FHIR.xhtml, so this guards against a model regression
      // silently downgrading the `xhtml` overload to the `string` one.
      const narrative = () => ({
        resourceType: 'Patient',
        text: { status: 'generated', div: '<p>x</p>' }
      });
      for (const model of ['dstu2', 'stu3', 'r4', 'r5']) {
        const fhirModel = getFHIRModel(model);
        expect(
          fhirpath.evaluate(narrative(), 'Patient.text.`div`.htmlChecks()',
            null, fhirModel)
        ).toEqual([false]);
        // The published narrative of the patient example passes in every
        // model. This is the positive half of the per-model coverage; it
        // cannot live in test/cases/htmlChecks.yaml, because a published
        // narrative is valid both as a document and as div content and would
        // therefore pass there under either overload.
        const example = loadResource(
          `${__dirname}/resources/${model}/patient-example.json`);
        expect(
          fhirpath.evaluate(example, 'Patient.text.`div`.htmlChecks()', null,
            fhirModel)
        ).toEqual([true]);
      }
      // Without a model the same value is a System.String, i.e. div content.
      expect(
        fhirpath.evaluate(narrative(), 'Patient.text.`div`.htmlChecks()')
      ).toEqual([true]);
    });


    it('should accept the types derived from string', () => {
      // `code`, `id` and `markdown` are derived from `string` in the FHIR type
      // hierarchy (`Patient.gender is FHIR.string` is true), so they are the
      // `string` overload.
      expect(
        fhirpath.evaluate(patient(), 'Patient.gender.htmlChecks()', null, r4)
      ).toEqual([true]);
      expect(
        fhirpath.evaluate(patient(), 'Patient.text.status.htmlChecks()', null,
          r4)
      ).toEqual([true]);
      // `Resource.id` is System.String in the model rather than FHIR `id`;
      // either way it is checked as div content.
      expect(
        fhirpath.evaluate(patient(), 'Patient.id.htmlChecks()', null, r4)
      ).toEqual([true]);
      // A value that is not valid div content is rejected rather than ignored.
      expect(
        fhirpath.evaluate({ resourceType: 'Patient', gender: '<p>x' },
          'Patient.gender.htmlChecks()', null, r4)
      ).toEqual([false]);
    });


    it('should not accept the types derived from uri', () => {
      // `uri` and the types derived from it (`url`, `canonical`, `oid`,
      // `uuid`) are not derived from `string`, so they are not the `string`
      // overload.
      expect(
        fhirpath.evaluate(patient(), 'Patient.identifier.system.htmlChecks()',
          null, r4)
      ).toEqual([]);
      const questionnaire = {
        resourceType: 'Questionnaire',
        status: 'active',
        url: 'http://example.org/q',
        derivedFrom: ['http://example.org/q0']
      };
      expect(
        fhirpath.evaluate(questionnaire, 'Questionnaire.url.htmlChecks()',
          null, r4)
      ).toEqual([]);
      expect(
        fhirpath.evaluate(questionnaire,
          'Questionnaire.derivedFrom.htmlChecks()', null, r4)
      ).toEqual([]);
    });


    it('should accept markdown, which is derived from string', () => {
      const questionnaire = {
        resourceType: 'Questionnaire',
        status: 'active',
        description: 'hi',
        item: [{ linkId: '1', type: 'display', text: 'hi' }]
      };
      // `Questionnaire.item.text` is a string in R4, and the markdown-typed
      // `Questionnaire.description` is checked the same way.
      expect(
        fhirpath.evaluate(questionnaire, 'Questionnaire.item.text.htmlChecks()',
          null, r4)
      ).toEqual([true]);
      expect(
        fhirpath.evaluate(questionnaire,
          'Questionnaire.description.htmlChecks()', null, r4)
      ).toEqual([true]);
      expect(
        fhirpath.evaluate({ ...questionnaire, description: '<p>x' },
          'Questionnaire.description.htmlChecks()', null, r4)
      ).toEqual([false]);
    });


    it('should keep the xhtml and string overloads disjoint', () => {
      // `<p>x</p>` is valid div content but not a valid document, so it tells
      // the two overloads apart. `xhtml` is not derived from `string` in any
      // supported model, so the type hierarchy walk that selects the `string`
      // overload cannot downgrade `Narrative.div` to div content.
      const resource = () => ({
        resourceType: 'Patient',
        text: { status: 'generated', div: '<p>x</p>' },
        gender: '<p>x</p>'
      });
      for (const model of ['dstu2', 'stu3', 'r4', 'r5']) {
        const fhirModel = getFHIRModel(model);
        expect(
          fhirpath.evaluate(resource(), 'Patient.text.`div`.htmlChecks()',
            null, fhirModel)
        ).toEqual([false]);
        expect(
          fhirpath.evaluate(resource(), 'Patient.gender.htmlChecks()', null,
            fhirModel)
        ).toEqual([true]);
      }
    });


    it('should keep working with resolveInternalTypes: false', () => {
      expect(
        fhirpath.evaluate(patient(), 'Patient.text.`div`.htmlChecks()', null,
          r4, { resolveInternalTypes: false })
      ).toEqual([true]);
    });


    it('should return an empty collection for a value-less element', () => {
      // A primitive carrying only an extension yields a node without a value,
      // so there is nothing to check.
      const resource = {
        resourceType: 'Patient',
        text: {
          status: 'generated',
          _div: {
            extension: [{ url: 'http://example.org/x', valueString: 'a' }]
          }
        }
      };
      expect(
        fhirpath.evaluate(resource, 'Patient.text.`div`.count()', null, r4)
      ).toEqual([1]);
      expect(
        fhirpath.evaluate(resource, 'Patient.text.`div`.htmlChecks()', null, r4)
      ).toEqual([]);
    });


    it('should throw when called with parameters', () => {
      expect(
        () => fhirpath.evaluate({}, "'<p>x</p>'.htmlChecks(1)")
      ).toThrow('htmlChecks expects no params');
    });

  });


  describe('the function name', () => {

    // The `htmlchecks()` alias itself is covered through the public API in
    // test/cases/htmlChecks.yaml; only the thrown error, which a YAML case
    // cannot express, is pinned here.
    it('should not make the function name case-insensitive', () => {
      // Exactly one alias is registered, not general case-insensitivity.
      expect(() => fhirpath.evaluate({}, "'x'.HtmlChecks()"))
        .toThrow('Not implemented: HtmlChecks');
      expect(() => fhirpath.evaluate({}, "'x'.HTMLCHECKS()"))
        .toThrow('Not implemented: HTMLCHECKS');
    });

  });


  describe('allow lists', () => {

    it('should accept every name in the narrative allow lists', () => {
      const rejectedElements = EXPECTED_ELEMENTS.filter(
        (el) => !check(`<${el}>x</${el}>`)
      );
      expect(rejectedElements).toEqual([]);

      const rejectedGlobal = EXPECTED_GLOBAL_ATTRS.filter(
        // `xmlns` is the one global attribute whose value is checked: it may
        // only declare the XHTML namespace.
        (attr) => !check(`<p ${attr}="${attr === 'xmlns' ? XHTML_NS : 'v'}">` +
          'x</p>')
      );
      expect(rejectedGlobal).toEqual([]);

      const rejectedPerElement = EXPECTED_ELEMENT_ATTRS.filter((entry) => {
        const dot = entry.indexOf('.');
        const el = entry.substring(0, dot);
        const attr = entry.substring(dot + 1);
        return !check(`<${el} ${attr}="v">x</${el}>`);
      });
      expect(rejectedPerElement).toEqual([]);
    });


    it('should not allow any name outside the narrative allow lists', () => {
      // The test above only shows that every permitted name is accepted; this
      // one pins the other direction, so that a name added to one of the Sets
      // by mistake (e.g. `script` or `onclick`) fails the build.
      expect(htmlChecks._allowedElements().sort())
        .toEqual([...EXPECTED_ELEMENTS].sort());
      expect(htmlChecks._allowedAttrs().sort())
        .toEqual([...EXPECTED_GLOBAL_ATTRS].sort());
      expect(htmlChecks._allowedElementAttrs().sort())
        .toEqual([...EXPECTED_ELEMENT_ATTRS].sort());
    });


    it('should not expose the allow lists for modification', () => {
      // The test-only accessors return copies, so that outside code cannot
      // weaken the checks by adding a name to one of the internal Sets.
      htmlChecks._allowedElements().push('script');
      htmlChecks._allowedAttrs().push('onclick');
      htmlChecks._allowedElementAttrs().push('p.onclick');
      expect(check('<script>x</script>')).toBe(false);
      expect(check('<p onclick="alert(1)">x</p>')).toBe(false);
    });


    it('should reject elements and attributes outside the allow lists', () => {
      expect(check('<script>alert(1)</script>')).toBe(false);
      expect(check('<form><input/></form>')).toBe(false);
      expect(check('<object data="x"/>')).toBe(false);
      expect(check('<link rel="stylesheet" href="x.css"/>')).toBe(false);
      expect(check('<base href="http://example.org"/>')).toBe(false);
      expect(check('<iframe src="http://example.org"/>')).toBe(false);
      expect(check('<head><title>x</title></head>')).toBe(false);
      expect(check('<body>x</body>')).toBe(false);
      expect(check('<ins>x</ins>')).toBe(false);
      expect(check('<del>x</del>')).toBe(false);
      expect(check('<font size="2">x</font>')).toBe(false);
      expect(check('<p onclick="alert(1)">x</p>')).toBe(false);
      expect(check('<a xlink:href="x">y</a>')).toBe(false);
      expect(check('<p unknownattr="x">y</p>')).toBe(false);
      expect(check('<p href="x">y</p>')).toBe(false);
      // A bare `space` attribute exists neither in HTML 4.0 nor in the R4
      // txt-1 XPath.
      expect(check('<pre space="preserve">x</pre>')).toBe(false);
    });


    it('should only allow width on table and image elements', () => {
      // `width` is not a global attribute in HTML 4.0: it belongs to the
      // table elements and to `img`.
      expect(check('<table width="100%"><tr><td>x</td></tr></table>'))
        .toBe(true);
      expect(check('<colgroup width="20%"><col width="10%"/></colgroup>text'))
        .toBe(true);
      expect(check('<table><tr><th width="1">h</th><td width="2">x</td></tr>' +
        '</table>')).toBe(true);
      expect(check('<img src="x" width="2" height="3"/>')).toBe(true);
      expect(check('<p width="3">x</p>')).toBe(false);
      expect(check('<div width="3">x</div>')).toBe(false);
      // `height` is accepted on `img` only.
      expect(check('<td height="3">x</td>')).toBe(false);
    });


    it('should keep the other table attributes global', () => {
      // Unlike `width`, the remaining table attributes are not scoped per
      // element: they are global in the txt-1 XPath, which tests attribute
      // names document-wide.
      expect(check('<p rowspan="2">x</p>')).toBe(true);
      expect(check('<p colspan="2">x</p>')).toBe(true);
      expect(check('<p scope="col">x</p>')).toBe(true);
      expect(check('<p span="2">x</p>')).toBe(true);
      expect(check('<p align="left" valign="top">x</p>')).toBe(true);
      expect(check('<p char="." charoff="2">x</p>')).toBe(true);
      expect(check('<p abbr="a" axis="b" headers="h">x</p>')).toBe(true);
      // On the table elements themselves they are accepted as well.
      expect(check('<table><tr><td rowspan="2" align="left">x</td></tr>' +
        '</table>')).toBe(true);
    });


    it('should reject image maps', () => {
      expect(check('<map name="m"><area href="x" alt="x"/></map>'))
        .toBe(false);
      expect(check('<map>x</map>')).toBe(false);
      expect(check('<area href="x" alt="x"/>text')).toBe(false);
      // The image-map hooks of `img` go with `map` and `area`: `usemap` can
      // only ever refer to a `map` that is rejected. Both belong to chapter
      // 13 of HTML 4.0.
      expect(check('<img src="x" usemap="#m"/>')).toBe(false);
      expect(check('<img src="x" ismap="ismap"/>')).toBe(false);
    });


    it('should accept an anchor with or without name or href', () => {
      // `name` and `href` are the only anchor-specific attributes, but
      // neither of them is required: the txt-1 human text lists the permitted
      // elements and attributes, and narratives generated by the FHIR
      // publisher do contain anchors without either attribute, e.g.
      // `<p><b>subject</b>: <a>Patient/example</a></p>`.
      expect(check('<a>x</a>')).toBe(true);
      expect(check('<a class="c">x</a>')).toBe(true);
      expect(check('<a name="n">x</a>')).toBe(true);
      expect(check('<a href="x">x</a>')).toBe(true);
      expect(check('<a name="n" href="x" class="c">x</a>')).toBe(true);
      // The other anchor attributes of HTML 4.0 are still not accepted.
      expect(check('<a rel="next">x</a>')).toBe(false);
      expect(check('<a href="x" rel="next">x</a>')).toBe(false);
      expect(check('<a href="x" shape="rect" coords="1">x</a>')).toBe(false);
    });


    it('should not allow xml-prefixed attributes', () => {
      // Namespace prefixes are not supported, so `xml:*` names are rejected
      // as well.
      expect(checkDoc('<div xml:id="n1">x</div>')).toBe(false);
      expect(check('<span xml:id="a1">x</span>')).toBe(false);
      expect(check('<p xml:lang="en">x</p>')).toBe(false);
      expect(check('<pre xml:space="preserve">x</pre>')).toBe(false);
      // The unprefixed name stays allowed.
      expect(check('<p lang="en">x</p>')).toBe(true);
    });


    it('should be case-sensitive', () => {
      expect(check('<P>x</P>')).toBe(false);
      expect(check('<p CLASS="c">x</p>')).toBe(false);
    });


    it('should allow a default xmlns declaration on any element', () => {
      // Well-formed XML may redeclare the default namespace on any element,
      // and FHIR narrative declares the XHTML namespace with one on the
      // `div`. Namespace prefixes are still not supported.
      expect(check('<div xmlns="http://www.w3.org/1999/xhtml">x</div>'))
        .toBe(true);
      expect(check('<p xmlns="http://www.w3.org/1999/xhtml">x</p>'))
        .toBe(true);
      expect(
        checkDoc('<div xmlns="http://www.w3.org/1999/xhtml">' +
          '<p xmlns="http://www.w3.org/1999/xhtml">x</p></div>')
      ).toBe(true);
      expect(check('<p xmlns:x="urn:a">y</p>')).toBe(false);
      expect(check('<div xmlns:x="urn:a">y</div>')).toBe(false);
      expect(check('<p xmlnsfoo="x">y</p>')).toBe(false);
    });


    it('should only allow the XHTML namespace to be declared', () => {
      // A narrative is XHTML, so a declaration that names another namespace
      // puts the content outside XHTML and the element allow list would be
      // applied to elements that are not XHTML at all.
      expect(checkDoc('<div xmlns="urn:evil">x</div>')).toBe(false);
      expect(check('<p xmlns="urn:evil">x</p>')).toBe(false);
      // Including on a descendant that redeclares the default namespace.
      expect(
        checkDoc('<div xmlns="http://www.w3.org/1999/xhtml">' +
          '<p xmlns="urn:evil">x</p></div>')
      ).toBe(false);
      // An empty declaration undeclares the default namespace, which leaves
      // the element outside XHTML as well.
      expect(check('<p xmlns="">x</p>')).toBe(false);
      // The URI is compared literally: neither case nor whitespace is
      // normalized, and character references are not expanded.
      expect(check('<div xmlns="http://www.w3.org/1999/XHTML">x</div>'))
        .toBe(false);
      expect(check('<div xmlns="http://www.w3.org/1999/xhtml ">x</div>'))
        .toBe(false);
      expect(check('<p xmlns="http&#58;//www.w3.org/1999/xhtml">x</p>'))
        .toBe(false);
      // Either kind of quotes may be used.
      expect(check("<div xmlns='http://www.w3.org/1999/xhtml'>x</div>"))
        .toBe(true);
      // The declaration itself remains optional.
      expect(checkDoc('<div>x</div>')).toBe(true);
      expect(check('<p>x</p>')).toBe(true);
    });


    it('should reject duplicate attributes', () => {
      expect(check('<p class="a" class="b">x</p>')).toBe(false);
    });

  });


  describe('document mode', () => {

    it('should require a single div root element', () => {
      expect(checkDoc('<div>x</div>')).toBe(true);
      expect(checkDoc('  <div>x</div>  ')).toBe(true);
      expect(checkDoc('<p>x</p>')).toBe(false);
      expect(checkDoc('<div>a</div><div>b</div>')).toBe(false);
      expect(checkDoc('')).toBe(false);
      expect(checkDoc('text')).toBe(false);
      expect(checkDoc('<div>a</div>tail')).toBe(false);
    });


    it('should allow the xhtml namespace declaration', () => {
      expect(
        checkDoc('<div xmlns="http://www.w3.org/1999/xhtml">x</div>')
      ).toBe(true);
      // A prefixed declaration is not accepted: prefixes are not supported.
      expect(
        checkDoc('<div xmlns:xhtml="http://www.w3.org/1999/xhtml">x</div>')
      ).toBe(false);
    });


    it('should reject comments outside the root element', () => {
      // In JSON "the characters between the first '>' and the last '<'
      // delimiters is the content of the <div> element".
      expect(checkDoc('<!-- c --><div>x</div>')).toBe(false);
      expect(checkDoc('<div>x</div><!-- c -->')).toBe(false);
      expect(checkDoc('<div><!-- c -->x</div>')).toBe(true);
      expect(check('<!-- c -->x')).toBe(true);
    });


    it('should reject a byte order mark outside the root element', () => {
      // U+FEFF is a legal XML character and is deliberately not treated as
      // whitespace, so a leading BOM is content outside the root element.
      expect(checkDoc('\uFEFF<div>x</div>')).toBe(false);
      expect(checkDoc('<div>\uFEFF</div>')).toBe(true);
    });

  });


  describe('content requirement', () => {

    it('should require non-whitespace content', () => {
      expect(check('x')).toBe(true);
      expect(check('')).toBe(false);
      expect(check(' \t\r\n ')).toBe(false);
      expect(check('<p></p>')).toBe(false);
      expect(check('<!-- just a comment -->')).toBe(false);
      expect(check('&#160;')).toBe(true);
    });


    it('should count a character reference as content', () => {
      // A character reference counts as content even when it denotes a
      // whitespace character: escaping a character is taken as a statement
      // that it is significant. This is deliberately more permissive than
      // normalize-space() in the R4 txt-2 XPath.
      expect(check('&#32;')).toBe(true);
      expect(check('&#x20;')).toBe(true);
      expect(check('&#9;')).toBe(true);
      expect(check('&#10;')).toBe(true);
      expect(check('&#13;')).toBe(true);
      expect(check(' ')).toBe(false);
    });


    it('should only count an image as content when it has src', () => {
      // The R4 txt-2 XPath is `descendant::text()[normalize-space(.)!=''] or
      // descendant::h:img[@src]`.
      expect(check('<img src="#a"/>')).toBe(true);
      expect(check('<img src=""/>')).toBe(true);
      expect(check('<img/>')).toBe(false);
      expect(check('<img alt="x"/>')).toBe(false);
      expect(check('<img alt="x"/>text')).toBe(true);
      expect(check('<p><img src="#a"/></p>')).toBe(true);
    });

  });


  describe('well-formedness', () => {

    it('should require every element to be closed', () => {
      expect(check('<p>a<br>b</p>')).toBe(false);
      expect(check('<img src="x">y')).toBe(false);
      expect(check('<hr>x')).toBe(false);
      expect(check('<p>a<br/>b</p>')).toBe(true);
      expect(check('<p>a<br></br>b</p>')).toBe(true);
      expect(check('<img src="x"></img>y')).toBe(true);
      expect(check('<hr/>x')).toBe(true);
    });


    it('should reject a mismatched end tag for a void element', () => {
      expect(check('<b>x</hr></b>')).toBe(false);
      expect(check('<p>x</br></p>')).toBe(false);
      expect(check('x</br>')).toBe(false);
    });


    it('should reject unterminated and malformed constructs', () => {
      expect(check('<p>x')).toBe(false);
      expect(check('<p')).toBe(false);
      expect(check('<p class="a')).toBe(false);
      expect(check('<p class="c>x</p>')).toBe(false);
      expect(check('<!-- x')).toBe(false);
      expect(check('<>')).toBe(false);
      expect(check('</>')).toBe(false);
      expect(check('x</p>')).toBe(false);
      expect(check('<b><i>x</b></i>')).toBe(false);
      expect(check('< p>x</p>')).toBe(false);
      expect(check('<p>x</ p>')).toBe(false);
      expect(check('<p/ >x')).toBe(false);
    });


    it('should accept whitespace variations in tags', () => {
      expect(check('<p >x</p >')).toBe(true);
      expect(check('<p class = "c">x</p>')).toBe(true);
      expect(check('<p\n class="c">x</p>')).toBe(true);
      expect(check('<p\r\n\tclass="c">x</p>')).toBe(true);
    });


    it('should reject processing instructions and declarations', () => {
      expect(check('<?xml version="1.0"?><p>x</p>')).toBe(false);
      expect(check('<!DOCTYPE html><p>x</p>')).toBe(false);
      expect(check('<!ENTITY a "b"><p>x</p>')).toBe(false);
      expect(check('<!')).toBe(false);
    });


    it('should reject CDATA sections', () => {
      // FHIR narrative XHTML does not allow CDATA.
      expect(check('<![CDATA[x]]>')).toBe(false);
      expect(check('<![CDATA[ ]]>')).toBe(false);
      expect(check('<![CDATA[x')).toBe(false);
      expect(check('<p><![CDATA[x]]></p>')).toBe(false);
      expect(check('<![INCLUDE[x]]>')).toBe(false);
    });


    it('should treat a DOCTYPE comment as an ordinary comment', () => {
      // The `<!DOCTYPE ...>` declaration is rejected, but a comment whose
      // body merely starts with `DOCTYPE` is an ordinary comment.
      expect(check('<!--DOCTYPE html-->x')).toBe(true);
      expect(check('<!-- DOCTYPE html -->x')).toBe(true);
    });

  });


  describe('attributes', () => {

    it('should require whitespace before every attribute', () => {
      // `STag ::= '<' Name (S Attribute)* S? '>'`, so attributes that are not
      // separated by whitespace are not well-formed XML.
      expect(check('<p title="a"class="c">x</p>')).toBe(false);
      expect(check('<img src="a"alt="b"/>x')).toBe(false);
      expect(check("<p title='a'class='c'>x</p>")).toBe(false);
      expect(check('<p title="a" class="c">x</p>')).toBe(true);
      expect(check('<img src="a"/>x')).toBe(true);
    });


    it('should reject attributes without a value', () => {
      expect(check('<td nowrap>x</td>')).toBe(false);
      expect(check('<td nowrap class="c">x</td>')).toBe(false);
      expect(check('<img ismap/>x')).toBe(false);
    });


    it('should reject unquoted attribute values', () => {
      expect(check('<p class=c>x</p>')).toBe(false);
      expect(check('<p class=>x</p>')).toBe(false);
      expect(check('<p class= >x</p>')).toBe(false);
      expect(check('<p class=c/>x')).toBe(false);
      expect(check('<a href=x/>y')).toBe(false);
      expect(check('<img src=x>y')).toBe(false);
    });


    it('should reject a raw "<" in an attribute value', () => {
      expect(check('<p title="a<b">x</p>')).toBe(false);
      expect(check("<p title='a<b'>x</p>")).toBe(false);
      expect(check('<p title="a&lt;b">x</p>')).toBe(true);
    });


    it('should accept quoted attribute values', () => {
      expect(check('<p class="c">x</p>')).toBe(true);
      expect(check("<p class='c'>x</p>")).toBe(true);
      expect(check('<p class="">x</p>')).toBe(true);
      expect(check('<p class="c"/>x')).toBe(true);
      expect(check("<p class='c'/>x")).toBe(true);
      expect(check('<a href="x"/>y')).toBe(true);
      expect(check('<img src="x"/>y')).toBe(true);
      expect(check('<p title="a&quot;b">x</p>')).toBe(true);
      expect(check('<p title=\'a"b\'>x</p>')).toBe(true);
      expect(check('<p title="a>b">x</p>')).toBe(true);
      expect(check('<p title="a\nb">x</p>')).toBe(true);
    });

  });


  describe('characters and character references', () => {

    it('should only support the XML entities', () => {
      expect(check('&amp;&lt;&gt;&quot;&apos;')).toBe(true);
      expect(check('a&nbsp;b')).toBe(false);
      expect(check('a&copy;b')).toBe(false);
      expect(check('a & b')).toBe(false);
      expect(check('a&amp b')).toBe(false);
      expect(check('<a href="a&nbsp;b">x</a>')).toBe(false);
    });


    it('should range-check numeric character references', () => {
      expect(check('a&#160;b')).toBe(true);
      expect(check('a&#xA0;b')).toBe(true);
      expect(check('a&#000065;b')).toBe(true);
      expect(check('a&#x1F600;b')).toBe(true);
      expect(check('a&#0;b')).toBe(false);
      expect(check('a&#xD800;b')).toBe(false);
      expect(check('a&#xFFFE;b')).toBe(false);
      expect(check('a&#x110000;b')).toBe(false);
      expect(check('a&#xX41;b')).toBe(false);
    });


    it('should reject illegal XML characters', () => {
      expect(check('a\u0001b')).toBe(false);
      expect(check('a\u000Bb')).toBe(false);
      expect(check('a\u000Cb')).toBe(false);
      expect(check('a\uD800b')).toBe(false);
      expect(check('a\uDC00b')).toBe(false);
      expect(check('a\uFFFEb')).toBe(false);
      expect(check('<p class="a\u0001b">x</p>')).toBe(false);
      expect(check('<!-- a\u0001b -->x')).toBe(false);
      expect(check('a\tb\r\nc')).toBe(true);
      expect(check('a\u{1F600}b')).toBe(true);
    });


    it('should reject illegal XML characters inside markup', () => {
      // Only space, tab, CR and LF separate names inside a tag; a C0 control
      // character is not a separator but an illegal XML character.
      expect(check('<p\u0000class="c">x</p>')).toBe(false);
      expect(check('<p\u000Cclass="c">x</p>')).toBe(false);
      expect(check('<p class="c"\u000B>x</p>')).toBe(false);
      expect(check('<p class\u0001="c">x</p>')).toBe(false);
      expect(check('<p class=\u0001"c">x</p>')).toBe(false);
      expect(check('<p\u0001>x</p>')).toBe(false);
      expect(check('<p>x</p\u000B>')).toBe(false);
      expect(check('<p>x</p\u0000 >')).toBe(false);
    });


    it('should reject "--" inside a comment', () => {
      expect(check('<!-- a -- b -->x')).toBe(false);
      // A comment body ending in `-` is rejected by the same rule: that `-` is
      // immediately followed by the `-` starting the closing `-->`.
      expect(check('<!--a--->y')).toBe(false);
      expect(check('<!----->x')).toBe(false);
      expect(check('<!-- a - b -->x')).toBe(true);
      expect(check('<!---->x')).toBe(true);
    });


    it('should reject "]]>" in character data', () => {
      expect(check('a]]>b')).toBe(false);
      expect(check('<p>a]]>b</p>')).toBe(false);
      expect(check('a]]&gt;b')).toBe(true);
      expect(check('a]]b')).toBe(true);
    });

  });


  describe('content models', () => {

    // Pins the intentional decision not to implement content-model rules:
    // `txt-1` and `txt-2` constrain the element and attribute names and the
    // content of the `div`, not how the elements are nested, and their XPaths
    // test no nesting either.
    it('should not enforce XHTML content models', () => {
      expect(check('<p><div>x</div></p>')).toBe(true);
      expect(check('<a href="1"><a href="2">x</a></a>')).toBe(true);
      expect(check('<td>x</td>')).toBe(true);
      expect(check('<li>x</li>')).toBe(true);
    });

  });


  describe('robustness', () => {

    it('should not overflow the stack on deeply nested markup', () => {
      const html = '<div>'.repeat(20000) + 'x' + '</div>'.repeat(20000);
      expect(check(html)).toBe(true);
    });


    it('should reject pathological input', () => {
      expect(check('<'.repeat(10000))).toBe(false);
      expect(check('&'.repeat(10000))).toBe(false);
      expect(check('<!--'.repeat(10000))).toBe(false);
      expect(check('a'.repeat(1000000))).toBe(true);
    });


    it('should not scan attributes quadratically', () => {
      // Duplicate attributes are detected with a linear scan of the names
      // seen so far, which is only safe because every accepted name comes
      // from the allow lists: a start tag runs out of distinct accepted
      // attributes after a few dozen and is rejected there. Distinct
      // `xmlns:<prefix>` declarations used to be accepted without bound, so
      // this ~1.9 MB input took minutes instead of milliseconds; a regression
      // therefore blows the test timeout.
      const attrs = [];
      for (let n = 0; n < 150000; ++n) {
        attrs.push(` xmlns:a${n}="u"`);
      }
      expect(check(`<p${attrs.join('')}>x</p>`)).toBe(false);
      // A tag that stays within the allow lists is still accepted.
      expect(check('<p class="c" id="i" title="t" lang="en">x</p>')).toBe(true);
    });

  });

});
