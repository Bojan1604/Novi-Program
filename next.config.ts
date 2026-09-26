import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PDF i Excel rade na poslužitelju iz node_modules (čitaju vlastite datoteke) — ne pakirati ih
  serverExternalPackages: ["pdfkit", "exceljs", "bwip-js", "node-forge", "xml-crypto", "nodemailer"],
  // fontovi za PDF moraju biti uz program i u produkcijskoj instalaciji
  outputFileTracingIncludes: { "/**": ["./assets/fonts/**"] },
  experimental: {
    // prilozi do 10 MB po datoteci, više datoteka odjednom (npr. 4 fotografije kvara s portala; provjera je i u src/domain/prilozi.ts)
    serverActions: { bodySizeLimit: "45mb" },
    proxyClientMaxBodySize: "45mb",
  },
};

export default nextConfig;
