import os, shutil, subprocess, sys, json, re
SRC='/home/claude/social'
app=sys.argv[1]
DST=f'/home/claude/{app}'
CFG={
 'publish':dict(name='Publish',host='publish.gershon.ai',project='gershon-publish',pkg='gershon-publish',home='/publishing',
   tagline='Create, approve, schedule and publish',
   keep_pages=['publishing','knowledge-base'],
   keep_api=['auth','publishing','knowledge-base','media','review','connect','clients','platforms','users'],
   keep_top=['review','connect'],
   open_pages=['/review/','/connect/'], open_api=['/api/review/','/api/media/','/api/connect/'],
   nav='''  {
    label: "Publish",
    items: [
      { href: "/publishing", icon: Send, label: "Content & review" },
      { href: "/publishing/calendar", icon: CalendarDays, label: "Calendar" },
      { href: "/publishing/accounts", icon: Link2, label: "Connections" },
      { href: "/publishing/autopilot", icon: Bot, label: "Autopilot" },
      { href: "/knowledge-base", icon: BookOpen, label: "Knowledge Base" },
    ],
  },''',
   icons=['Send','CalendarDays','Link2','Bot','BookOpen']),
 'socialtracking':dict(name='Social Tracking',host='socialtracking.gershon.ai',project='gershon-socialtracking',pkg='gershon-socialtracking',home='/summary',
   tagline='Was the agreed work done? Evidence for the monthly report',
   keep_pages=['summary','reports','clients'],
   keep_api=['auth','clients','compliance','campaigns','reports','report','dashboard','posts','platforms','analytics','followers','export','audit','collection-health','users'],
   keep_top=[],
   open_pages=[], open_api=[],
   nav='''  {
    label: "Tracking",
    items: [
      { href: "/summary", icon: ClipboardCheck, label: "Work completion" },
      { href: "/reports", icon: FileText, label: "Monthly reports" },
      { href: "/clients", icon: Building2, label: "Companies" },
    ],
  },''',
   icons=['ClipboardCheck','FileText','Building2']),
}[app]

# 1. fresh copy (keep target .git)
for e in os.listdir(DST):
    if e!='.git': shutil.rmtree(os.path.join(DST,e)) if os.path.isdir(os.path.join(DST,e)) and not os.path.islink(os.path.join(DST,e)) else os.remove(os.path.join(DST,e))
subprocess.check_call(f"cd {SRC} && tar cf - --exclude=./.git --exclude=./node_modules --exclude=./.next --exclude=./.vercel . | (cd {DST} && tar xf -)", shell=True)
os.chdir(DST)
def rm(p):
    if os.path.isdir(p): shutil.rmtree(p)
    elif os.path.exists(p): os.remove(p)
# 2. prune pages
D='src/app/(dashboard)'
for e in os.listdir(D):
    if os.path.isdir(f'{D}/{e}') and e not in CFG['keep_pages']: rm(f'{D}/{e}')
for e in ['r','review','connect']:
    if e not in CFG['keep_top']: rm(f'src/app/{e}')
for e in os.listdir('src/app/api'):
    if e not in CFG['keep_api']: rm(f'src/app/api/{e}')
if app=='socialtracking':
    for e in ['daily','ops','promote']: rm(f'src/app/api/report/{e}')
for e in ['admin']:  # user admin stays in Social
    pass
# 3. repo-level
rm('.github'); rm('extension-src'); rm('HANDOFF.txt'); rm('DEPLOYMENT.md'); rm('tests')
for f in os.listdir('public'):
    if f.endswith('.zip'): rm('public/'+f)
pk=json.load(open('package.json')); pk['name']=CFG['pkg']; pk['version']='0.1.0'
pk['scripts']['build']='next build'; json.dump(pk,open('package.json','w'),indent=2); open('package.json','a').write('\n')
w=open('wrangler.toml').read().replace('name = "gershoncrm-social"',f'name = "{CFG["project"]}"'); open('wrangler.toml','w').write(w)
# 4. site.ts
open('src/lib/site.ts','w').write(f'''/**
 * The address of this app — ONE place. {CFG["name"]} lives at {CFG["host"]}.
 * Split out of Social on 2026-10-26 (see docs/THREE-PLATFORM-SPLIT.md).
 */
export const SITE_HOST = "{CFG["host"]}";
export const SITE_ORIGIN = `https://${{SITE_HOST}}`;

/** No legacy hosts: this app has always lived on its own domain. */
export const LEGACY_HOSTS: string[] = [];

export function siteUrl(): string {{
  const env = (process.env.NEXT_PUBLIC_APP_URL || "").trim().replace(/\\/+$/, "");
  if (env && env.includes(SITE_HOST)) return env;
  return SITE_ORIGIN;
}}
''')
open('src/lib/product.ts','w').write(f'''/** Which of the three Gershon platforms this build is. */
export const PRODUCT_NAME = "{CFG["name"]}";
export const PRODUCT_HOME = "{CFG["home"]}";
export const PRODUCT_TAGLINE = "{CFG["tagline"]}";
export const PRODUCT_VERSION = "0.1.0";
''')
# 5. middleware
m=open('/home/claude/split/templates/middleware.ts').read()
m=m.replace('__PRODUCT_NAME__',CFG['name']).replace('__HOST__',CFG['host'])
m=m.replace('__OPEN_PAGES__',', '.join(json.dumps(x) for x in CFG['open_pages']) or '')
m=m.replace('__OPEN_API__',', '.join(json.dumps(x) for x in CFG['open_api']) or '')
m=m.replace(', ]',']')
doc='\n'.join(f' *   - {x} (token / secret in the URL or route is the access)' for x in CFG['open_pages']+CFG['open_api'])
m=m.replace('__OPEN_DOC__',doc or ' *   - nothing else')
open('src/middleware.ts','w').write(m)
os.makedirs('src/app/api/ping',exist_ok=True)
open('src/app/api/ping/route.ts','w').write('''export const runtime = "edge";
import { PRODUCT_NAME, PRODUCT_VERSION } from "@/lib/product";
import { SITE_HOST } from "@/lib/site";

/** Public liveness check: which product answered, and which build. */
export async function GET() {
  return Response.json({
    ok: true,
    product: PRODUCT_NAME,
    host: SITE_HOST,
    version: PRODUCT_VERSION,
    build: process.env.NEXT_PUBLIC_BUILD_NUMBER || null,
    commit: (process.env.NEXT_PUBLIC_APP_VERSION || "").slice(0, 7) || null,
  });
}
''')
# 6. root page -> home
open('src/app/page.tsx','w').write(f'''export const runtime = 'edge';
import {{ redirect }} from "next/navigation";
import {{ PRODUCT_HOME }} from "@/lib/product";

/** Internal app: no marketing page. The middleware already sent strangers to /login. */
export default function RootPage() {{
  redirect(PRODUCT_HOME);
}}
''')
# 7. dashboard layout: no one-shot migrations, no extension/collection banners
open('src/app/(dashboard)/layout.tsx','w').write('''export const runtime = 'edge';
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { Sidebar } from "@/components/layout/sidebar";
import { ViewFiltersProvider } from "@/lib/view-filters";
import { ApiRetry } from "@/components/layout/api-retry";
import { PRODUCT_NAME, PRODUCT_VERSION } from "@/lib/product";

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || "dev";
const BUILD_DATE = process.env.NEXT_PUBLIC_BUILD_DATE || new Date().toISOString();
const BUILD_NUMBER = process.env.NEXT_PUBLIC_BUILD_NUMBER || "";

function formatBuildDate(raw: string): string {
  try {
    return new Date(raw).toLocaleString("en-US", {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: false,
      timeZone: "America/New_York", timeZoneName: "short",
    });
  } catch {
    return raw;
  }
}

/**
 * Split from Social on 2026-10-26. Unlike Social's layout this one runs NO
 * one-shot data migrations or backfills: those have exactly one owner (Social)
 * and must never run from three apps. The middleware has already checked that
 * the visitor belongs to the Gershon workspace.
 */
export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session?.user) redirect("/login");

  const shortSha = APP_VERSION.length > 8 ? APP_VERSION.slice(0, 7) : APP_VERSION;
  return (
    <ViewFiltersProvider>
      <ApiRetry />
      <div className="flex h-screen overflow-hidden bg-[#F5F4F0]">
        <Sidebar />
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-[1400px] mx-auto px-9 pt-7 pb-10">
            {children}
            <footer className="mt-12 pt-4 border-t border-gray-200 text-[11px] text-gray-500 font-mono">
              {PRODUCT_NAME} v{PRODUCT_VERSION}
              {BUILD_NUMBER && <> &middot; Build #{BUILD_NUMBER}</>} &middot; {shortSha} &middot; {formatBuildDate(BUILD_DATE)}
            </footer>
          </div>
        </main>
      </div>
    </ViewFiltersProvider>
  );
}
''')
# 8. sidebar
s=open('src/components/layout/sidebar.tsx').read()
a=s.index('const navGroups'); b=s.index('];',a)+2
s=s[:a]+'const navGroups: { label: string; items: NavItem[] }[] = [\n'+CFG['nav']+'\n];'+s[b:]
# icons import
s=re.sub(r'import \{([^}]*)\} from "lucide-react";', lambda mm: 'import {'+mm.group(1).rstrip().rstrip(',')+', '+', '.join(i for i in CFG['icons'] if i not in mm.group(1))+'} from "lucide-react";' if CFG['icons'] else mm.group(0), s, count=1)
s=s.replace('const setupIncomplete = useSetupIncomplete();','const setupIncomplete = false;')
s=s.replace('<Link href="/dashboard"',f'<Link href="{CFG["home"]}"')
s=s.replace('<DemoToggleButton />','')
open('src/components/layout/sidebar.tsx','w').write(s)
# 9. wordmark uses product name
w=open('src/components/brand/social-mark.tsx').read()
w=w.replace('>Social</div>','>{PRODUCT_NAME}</div>')
w='import { PRODUCT_NAME } from "@/lib/product";\n'+w if not w.startswith('"use client"') else w.replace('"use client";','"use client";\nimport { PRODUCT_NAME } from "@/lib/product";',1)
open('src/components/brand/social-mark.tsx','w').write(w)
# 10. login copy
l=open('src/app/(auth)/login/page-client.tsx').read()
l=l.replace('New here? Signing in creates your own workspace.',f'{CFG["name"]} is an internal Gershon platform. Sign in with your Gershon account.')
open('src/app/(auth)/login/page-client.tsx','w').write(l)
# 11. docs
shutil.copy('/home/claude/split/THREE-PLATFORM-SPLIT.md','docs/THREE-PLATFORM-SPLIT.md')
for f in ['AUTOPILOT.md','CAMPAIGN-MONTHLY-REPORT.md','HEALTH-CHECK.md','OPS-REPORTS.md','DOMAIN-MOVE-PLAYBOOK.md']:
    keep = (app=='publish' and f=='AUTOPILOT.md') or (app=='socialtracking' and f in ('CAMPAIGN-MONTHLY-REPORT.md',))
    if not keep: rm('docs/'+f)
print('done',app)
# 12. product-specific trims of Social-only actions
if app=='socialtracking':
    p='src/components/dashboard/dashboard-client.tsx'; s=open(p).read()
    s=s.replace('import { ExtensionHealthBanner } from "./extension-health-banner";\n','').replace('<ExtensionHealthBanner />','')
    open(p,'w').write(s)
    p='src/app/(dashboard)/clients/[id]/page-client.tsx'; s=open(p).read()
    s=s.replace('import { ClientSyncButton } from "@/components/clients/client-sync-button";\n','').replace('<ClientSyncButton clientId={client.id} />','')
    open(p,'w').write(s)
print('trimmed',app)
# 13. repo docs
gi=open('.gitignore').read()
if '.vercel' not in gi: open('.gitignore','a').write('\n# Cloudflare build output\n.vercel/\n')
other = 'Social Tracking (socialtracking.gershon.ai)' if app=='publish' else 'Publish (publish.gershon.ai)'
open('README.md','w').write(f'''# {CFG["name"]} — {CFG["host"]}

{CFG["tagline"]}. Internal Gershon platform, one of three split out of
`gershonconsulting/social` on 2026-10-26 (spec: `docs/THREE-PLATFORM-SPLIT.md`):

| Platform | Domain | Audience |
|---|---|---|
| Publish | publish.gershon.ai | Gershon team |
| Social | social.gershon.ai | Clients (standalone intelligence) |
| Social Tracking | socialtracking.gershon.ai | Gershon team |

## Phase 1 (this version, v0.1.0)

- Own domain, own Cloudflare Pages project (`{CFG["project"]}`), own LinkedIn sign-in app.
- Only {CFG["name"]} pages and APIs; product-specific menu.
- Access: signed in AND member of the Gershon Consulting (primary) workspace — enforced
  in `src/middleware.ts` on pages and API. Fails closed.
- Database: shared with Social as a temporary bridge (spec §5). This app NEVER runs
  `prisma db push`; Social remains the schema owner until the data split.
- No scheduled jobs here yet. Social keeps every cron (autopilot, publish sweep, reports)
  until cutover, so nothing runs twice (spec §9).
- No one-shot backfills/migrations in the layout (Social owns those).

## Deploy

Push to `main` here, then the deploy is run by `.github/workflows/deploy-siblings.yml`
in `gershonconsulting/social` (it holds the shared secrets): pushing branch
`deploy/{app}` in the social repo builds this repo's `main` and deploys it.

## Next phases

See spec §10: own datastore, integration contracts, moving crons, extension split,
then the dashboards/reports in §14–17.
''')
open('HANDOFF.txt','w').write(f'''================================================================
HANDOFF.txt  -  {app}  ({CFG["host"]})
Written by: Claude (Anthropic) - 2026-10-26
================================================================
READ FIRST: github.com/gershonconsulting/memory -> HANDOFF.txt
Rules: Olivier never runs commands, uploads or clicks injected buttons.
End replies with GREEN CHECK (ready to test + link) or RED CROSS (+3 options).

WHAT: {CFG["name"]} - {CFG["tagline"]}. Internal only.
SPEC: docs/THREE-PLATFORM-SPLIT.md (sections 2, 14-17 for this product).
SIBLINGS: social.gershon.ai (repo social), {other}.

STATUS
[DONE] v0.1.0 phase 1: split UI/API, internal-only gate, own domain.
[TODO] own datastore + versioned contracts (spec 5-6)
[TODO] move this product's crons out of Social at cutover (spec 9)
[TODO] dashboards / weekly + monthly reports / alerts (spec 14-17)

DEPLOY: social repo, workflow deploy-siblings.yml, push branch deploy/{app}.
Pages project: {CFG["project"]}. LinkedIn app redirect:
https://{CFG["host"]}/api/auth/linkedin/callback
DB: shared Neon DB (CF_DATABASE_URL). Never prisma db push from here.
''')
# 14. Olivier 2026-10-26: Publish and Social Tracking serve CAMPAIGN + INTERNAL
#     companies only; Social covers the whole ecosystem. Enforced in the scoped
#     data layer (every scoped read) and in the raw company list.
p='src/lib/product.ts'; s=open(p).read()
s+='''
/**
 * Company categories this product serves (Olivier, 2026-10-26): Publish and
 * Social Tracking are for our CAMPAIGN clients and INTERNAL (Gershon) only.
 * Social keeps the whole ecosystem (partners, competition, prospects...).
 */
export const PRODUCT_CLIENT_TYPES = ["CAMPAIGN", "INTERNAL"] as const;
'''
open(p,'w').write(s)
p='src/lib/scoped-db.ts'; s=open(p).read()
s=s.replace('import prisma from "@/lib/db-raw";','import prisma from "@/lib/db-raw";\nimport { PRODUCT_CLIENT_TYPES } from "@/lib/product";',1)
s=s.replace('function mergeWhere(','''/** Models whose rows belong to one company (relation field `client`). */
const CLIENT_LINKED = new Set([
  "PlatformConnection", "PostingSchedule", "SocialPost", "DailyCompliance",
  "FollowerSnapshot", "ContentAnalysis", "PostPrompt",
]);

/**
 * Product scope on top of the tenant scope: this app only sees companies in
 * PRODUCT_CLIENT_TYPES (and rows that belong to them). Reads only — a write
 * aimed at an out-of-scope company finds nothing to read it from in the UI.
 */
function scopeCategory(model: string, args: Record<string, unknown>): Record<string, unknown> {
  const where = (args.where ?? {}) as Record<string, unknown>;
  const types = { in: [...PRODUCT_CLIENT_TYPES] };
  if (model === "Client") return { ...args, where: { AND: [where, { clientType: types }] } };
  if (CLIENT_LINKED.has(model)) return { ...args, where: { AND: [where, { client: { is: { clientType: types } } }] } };
  return args;
}

function mergeWhere(''',1)
s=s.replace('            return run(mergeWhere(a, orgId));\n          }\n\n          // findUnique','            return run(scopeCategory(model, mergeWhere(a, orgId)));\n          }\n\n          // findUnique',1)
s=s.replace(').findFirst(mergeWhere(a, orgId));',').findFirst(scopeCategory(model, mergeWhere(a, orgId)));',1)
open(p,'w').write(s)
p='src/app/api/clients/route.ts'
if os.path.exists(p):
    s=open(p).read()
    old='''  const clientType = searchParams.get("clientType");
  if (clientType) {
    where.clientType = clientType;
  }'''
    new='''  // This product only serves CAMPAIGN + INTERNAL companies (see lib/product.ts).
  const clientType = searchParams.get("clientType");
  const allowed = PRODUCT_CLIENT_TYPES as readonly string[];
  where.clientType = clientType && allowed.includes(clientType) ? clientType : { in: [...allowed] };'''
    assert old in s
    s=s.replace(old,new,1)
    s='import { PRODUCT_CLIENT_TYPES } from "@/lib/product";\n'+s if not s.startswith('export const runtime') else s.replace("\n", '\nimport { PRODUCT_CLIENT_TYPES } from "@/lib/product";\n',1)
    open(p,'w').write(s)
p='src/app/api/export/route.ts'
if os.path.exists(p):
    s=open(p).read()
    old='`SELECT name FROM clients WHERE id = $1 AND "organizationId" = $2`'
    assert old in s
    s=s.replace(old,'''`SELECT name FROM clients WHERE id = $1 AND "organizationId" = $2 AND "clientType"::text IN ('CAMPAIGN','INTERNAL')`''',1)
    open(p,'w').write(s)
print('scoped',app)
