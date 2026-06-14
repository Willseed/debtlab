const projectKey = process.env.SONAR_PROJECT_KEY ?? 'Willseed_debtlab';
const sonarToken = process.env.SONAR_TOKEN;
const pageSize = 100;
const timeoutSeconds = Number(process.env.SONAR_OPEN_ISSUES_TIMEOUT_SECONDS ?? 600);
const pollIntervalSeconds = Number(process.env.SONAR_OPEN_ISSUES_POLL_SECONDS ?? 20);
const deadline = Date.now() + timeoutSeconds * 1000;

let result = await readSonarFindings();

while (hasFindings(result) && Date.now() < deadline) {
  reportSonarFindings(result, 'waiting for SonarCloud analysis to settle');
  await sleep(pollIntervalSeconds * 1000);
  result = await readSonarFindings();
}

if (hasFindings(result)) {
  reportSonarFindings(result, 'deployment is blocked');
  process.exitCode = 1;
} else {
  console.log(`SonarCloud has no open issues or security hotspots for ${projectKey}.`);
}

async function readSonarFindings() {
  const [openIssues, securityHotspots] = await Promise.all([
    readOpenIssues(),
    readSecurityHotspots(),
  ]);

  return { openIssues, securityHotspots };
}

async function readOpenIssues() {
  const issues = [];
  let page = 1;
  let total = 0;

  do {
    const payload = await readOpenIssuesPage(page);
    total = Number(payload.total ?? 0);
    issues.push(...(Array.isArray(payload.issues) ? payload.issues : []));
    page += 1;
  } while (issues.length < total);

  return { issues, total };
}

async function readSecurityHotspots() {
  const hotspots = [];
  let page = 1;
  let total = 0;

  do {
    const payload = await readSecurityHotspotsPage(page);
    total = Number(payload.paging?.total ?? 0);
    hotspots.push(...(Array.isArray(payload.hotspots) ? payload.hotspots : []));
    page += 1;
  } while (hotspots.length < total);

  return { hotspots, total };
}

async function readOpenIssuesPage(page) {
  const url = new URL('https://sonarcloud.io/api/issues/search');
  url.searchParams.set('componentKeys', projectKey);
  url.searchParams.set('issueStatuses', 'OPEN');
  url.searchParams.set('p', String(page));
  url.searchParams.set('ps', String(pageSize));

  const response = await fetch(url, {
    headers: sonarToken
      ? {
          Authorization: `Bearer ${sonarToken}`,
        }
      : undefined,
  });

  if (!response.ok) {
    throw new Error(`SonarCloud open issue check failed with HTTP ${response.status}`);
  }

  return response.json();
}

async function readSecurityHotspotsPage(page) {
  const url = new URL('https://sonarcloud.io/api/hotspots/search');
  url.searchParams.set('projectKey', projectKey);
  url.searchParams.set('status', 'TO_REVIEW');
  url.searchParams.set('p', String(page));
  url.searchParams.set('ps', String(pageSize));

  const response = await fetch(url, {
    headers: sonarToken
      ? {
          Authorization: `Bearer ${sonarToken}`,
        }
      : undefined,
  });

  if (!response.ok) {
    throw new Error(`SonarCloud security hotspot check failed with HTTP ${response.status}`);
  }

  return response.json();
}

function hasFindings(result) {
  return result.openIssues.total > 0 || result.securityHotspots.total > 0;
}

function reportSonarFindings(result, status) {
  console.error(
    `SonarCloud has ${result.openIssues.total} open issue(s) and ` +
      `${result.securityHotspots.total} security hotspot(s) for ${projectKey}; ${status}.`,
  );

  for (const issue of result.openIssues.issues.slice(0, 20)) {
    const component = String(issue.component ?? '').replace(`${projectKey}:`, '');
    const line = issue.line ? `:${issue.line}` : '';
    console.error(`- ${issue.rule} ${component}${line} ${issue.message}`);
  }

  for (const hotspot of result.securityHotspots.hotspots.slice(0, 20)) {
    const component = String(hotspot.component ?? '').replace(`${projectKey}:`, '');
    const line = hotspot.line ? `:${hotspot.line}` : '';
    console.error(`- ${hotspot.securityCategory} ${component}${line} ${hotspot.message}`);
  }

  if (result.openIssues.total > 20) {
    console.error(`- ...and ${result.openIssues.total - 20} more open issue(s).`);
  }

  if (result.securityHotspots.total > 20) {
    console.error(`- ...and ${result.securityHotspots.total - 20} more security hotspot(s).`);
  }
}

function sleep(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
