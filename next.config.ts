import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PDF i Excel rade na poslužitelju iz node_modules (čitaju vlastite datoteke) — ne pakirati ih
  serverExternalPackages: ["pdfkit", "exceljs"],
  // fontovi za PDF moraju biti uz program i u produkcijskoj instalaciji
  outputFileTracingIncludes: { "/**": ["./assets/fonts/**"] },
};

export default nextConfig;
