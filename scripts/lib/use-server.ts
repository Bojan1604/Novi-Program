/**
 * Pravilo: datoteka s direktivom 'use server' smije izvoziti samo async funkcije
 * (i tipove). Next.js inače pukne tek u pregledniku ili pri buildu s nejasnom porukom.
 */
import ts from "typescript";

export function provjeriUseServer(tekst: string, ime = "datoteka.ts"): string[] {
  const izvor = ts.createSourceFile(ime, tekst, ts.ScriptTarget.Latest, true, ime.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  if (!imaDirektivuNaVrhu(izvor)) return [];

  const greske: string[] = [];
  const javi = (cvor: ts.Node, poruka: string) => {
    const { line } = izvor.getLineAndCharacterOfPosition(cvor.getStart(izvor));
    greske.push(`${ime}:${line + 1} — ${poruka}`);
  };

  for (const naredba of izvor.statements) {
    if (ts.isInterfaceDeclaration(naredba) || ts.isTypeAliasDeclaration(naredba)) continue;

    if (ts.isExportDeclaration(naredba)) {
      if (naredba.isTypeOnly) continue;
      if (naredba.exportClause && ts.isNamedExports(naredba.exportClause) && naredba.exportClause.elements.every((e) => e.isTypeOnly)) continue;
      javi(naredba, "„export { … }“ nije dopušten u 'use server' datoteci; izvezite svaku funkciju s „export async function“.");
      continue;
    }

    if (ts.isExportAssignment(naredba)) {
      if (!jeAsyncIzraz(naredba.expression)) javi(naredba, "„export default“ mora biti async funkcija.");
      continue;
    }

    if (!imaExport(naredba)) continue;

    if (ts.isFunctionDeclaration(naredba)) {
      if (!imaAsync(naredba)) javi(naredba, `funkcija „${naredba.name?.text ?? "default"}“ mora biti async.`);
      continue;
    }

    if (ts.isVariableStatement(naredba)) {
      for (const d of naredba.declarationList.declarations) {
        const naziv = d.name.getText(izvor);
        if (!d.initializer || !jeAsyncIzraz(d.initializer)) {
          javi(d, `„${naziv}“ nije async funkcija; iz 'use server' datoteke smiju se izvoziti samo async funkcije.`);
        }
      }
      continue;
    }

    if (ts.isEnumDeclaration(naredba) || ts.isClassDeclaration(naredba)) {
      javi(naredba, "enum i klasa ne smiju se izvoziti iz 'use server' datoteke.");
      continue;
    }

    javi(naredba, "nedopušten izvoz u 'use server' datoteci.");
  }
  return greske;
}

function imaDirektivuNaVrhu(izvor: ts.SourceFile): boolean {
  for (const naredba of izvor.statements) {
    if (ts.isExpressionStatement(naredba) && ts.isStringLiteral(naredba.expression)) {
      if (naredba.expression.text === "use server") return true;
      continue;
    }
    return false;
  }
  return false;
}

function imaExport(cvor: ts.Statement): boolean {
  return ts.canHaveModifiers(cvor) && (ts.getModifiers(cvor) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
}

function imaAsync(cvor: ts.Node): boolean {
  return ts.canHaveModifiers(cvor) && (ts.getModifiers(cvor) ?? []).some((m) => m.kind === ts.SyntaxKind.AsyncKeyword);
}

function jeAsyncIzraz(izraz: ts.Expression): boolean {
  let e = izraz;
  while (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isSatisfiesExpression(e)) e = e.expression;
  return (ts.isArrowFunction(e) || ts.isFunctionExpression(e)) && imaAsync(e);
}

/**
 * Pravilo prava: svaka izvezena funkcija u 'use server' datoteci mora pozvati `akcija(…)`
 * (provjera prijave i prava na poslužitelju), osim ako iznad nje piše `// javna akcija: <razlog>`.
 */
export function provjeriZastituAkcija(tekst: string, ime = "datoteka.ts"): string[] {
  const izvor = ts.createSourceFile(ime, tekst, ts.ScriptTarget.Latest, true, ime.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  if (!imaDirektivuNaVrhu(izvor)) return [];
  const greske: string[] = [];

  for (const naredba of izvor.statements) {
    if (!imaExport(naredba)) continue;
    const tijela: { naziv: string; cvor: ts.Node; tijelo: ts.Node | undefined }[] = [];
    if (ts.isFunctionDeclaration(naredba)) {
      tijela.push({ naziv: naredba.name?.text ?? "default", cvor: naredba, tijelo: naredba.body });
    } else if (ts.isVariableStatement(naredba)) {
      for (const d of naredba.declarationList.declarations) {
        const init = d.initializer;
        if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
          tijela.push({ naziv: d.name.getText(izvor), cvor: naredba, tijelo: init.body });
        }
      }
    }
    for (const { naziv, cvor, tijelo } of tijela) {
      const komentari = (ts.getLeadingCommentRanges(tekst, cvor.getFullStart()) ?? []).map((r) => tekst.slice(r.pos, r.end));
      if (komentari.some((k) => /javna akcija:\s*\S/.test(k))) continue;
      if (tijelo && poziva(tijelo, "akcija")) continue;
      const { line } = izvor.getLineAndCharacterOfPosition(cvor.getStart(izvor));
      greske.push(`${ime}:${line + 1} — akcija „${naziv}“ ne poziva akcija(…) (provjera prava) niti je označena „// javna akcija: razlog“.`);
    }
  }
  return greske;
}

function poziva(cvor: ts.Node, ime: string): boolean {
  let nadeno = false;
  const obidi = (n: ts.Node) => {
    if (nadeno) return;
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === ime) {
      nadeno = true;
      return;
    }
    ts.forEachChild(n, obidi);
  };
  obidi(cvor);
  return nadeno;
}
