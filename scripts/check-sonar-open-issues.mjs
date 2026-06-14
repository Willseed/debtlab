const projectKey = process.env.SONAR_PROJECT_KEY ?? 'Willseed_debtlab';
const sonarToken = process.env.SONAR_TOKEN;
const pageSize = 100;
const timeoutSeconds = Number(process.env.SONAR_OPEN_ISSUES_TIMEOUT_SECONDS ?? 600);
const pollIntervalSeconds = Number(process.env.SONAR_OPEN_ISSUES_POLL_SECONDS ?? 20);
const deadline = Date.now() + timeoutSeconds * 1000;

let result = await readOpenIssues();

while (result.total > 0 && Date.now() < deadline) {
  reportOpenIssues(result, 'waiting for SonarCloud analysis to settle');
  await sleep(pollIntervalSeconds * 1000);
  result = await readOpenIssues();
}

if (result.total > 0) {
  reportOpenIssues(result, 'deployment is blocked');
  process.exitCode = 1;
} else {
  console.log(`SonarCloud has no open issues for ${projectKey}.`);
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

function reportOpenIssues(result, status) {
  console.error(`SonarCloud has ${result.total} open issue(s) for ${projectKey}; ${status}.`);
  for (const issue of result.issues.slice(0, 20)) {
    const component = String(issue.component ?? '').replace(`${projectKey}:`, '');
    const line = issue.line ? `:${issue.line}` : '';
    console.error(`- ${issue.rule} ${component}${line} ${issue.message}`);
  }

  if (result.total > 20) {
    console.error(`- ...and ${result.total - 20} more open issue(s).`);
  }
}

function sleep(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
