import { Context } from 'probot'
import { chooseUsers, chooseUsersFromGroups, includesSkipKeywords } from './util'

interface AppConfig {
  addReviewers: boolean,
  addAssignees: boolean,
  reviewers: string[],
  assignees?: string[],
  numberOfAssignees?: number,
  numberOfReviewers: number,
  skipKeywords?: string[],
  useReviewGroups?: boolean,
  useAssigneeGroups?: boolean,
  reviewGroups?: { [key: string]: string[] } | undefined,
  assigneeGroups?: { [key: string]: string[] } | undefined
}

export async function handlePullRequest (context: Context): Promise<void> {
  const config: AppConfig | null = await context.config<AppConfig | null>('auto_assign.yml')
  if (!config) {
    throw new Error('the configuration file failed to load')
  }

  const title = context.payload.pull_request.title
  if (config.skipKeywords && includesSkipKeywords(title, config.skipKeywords)) {
    context.log('skips adding reviewers')
    return
  }

  if (config.useReviewGroups && !config.reviewGroups) {
    throw new Error('Error in configuration file to do with using review groups. Expected \'reviewGroups\' variable to be set because the variable \'useReviewGroups\' = true.')
  }

  if (config.useAssigneeGroups && !config.assigneeGroups) {
    throw new Error('Error in configuration file to do with using review groups. Expected \'assigneeGroups\' variable to be set because the variable \'useAssigneeGroups\' = true.')
  }

  const reviewers: string[] = await chooseReviewers(context, config, [], context.payload.pull_request.user.login)
  await chooseAssignees(context, config, reviewers, context.payload.pull_request.user.login)
}

export async function chooseReviewers (context: Context, config: AppConfig, reviewers: string[], owner: string) {
  if (!config.reviewers && !config.reviewGroups) return []

  // @ts-ignore
  const useGroups: boolean = config.useReviewGroups && Object.keys(config.reviewGroups).length > 0

  // TODO: Fix code based on rule: prefer-conditional-expression
  // @see https://palantir.github.io/tslint/rules/prefer-conditional-expression/
  if (useGroups) {
    reviewers = chooseUsersFromGroups(owner, config.reviewGroups, config.numberOfReviewers)
  } else {
    reviewers = chooseUsers(config.reviewers, config.numberOfReviewers, owner)
  }

  if (config.addReviewers && reviewers.length > 0) {
    try {
      const params = context.issue({ reviewers })
      const result: any = await context.github.pullRequests.createReviewRequest(params)
      context.log(result)
    } catch (error) {
      context.log(error)
    }
  }
  return reviewers
}

export async function chooseAssignees (context: Context, config: AppConfig, reviewers: string[], owner: string) {
  if (!config.addAssignees) return

  let assignees: string[] = []
  // @ts-ignore
  const useGroups: boolean = config.useAssigneeGroups && Object.keys(config.assigneeGroups).length > 0

  if (useGroups) {
    assignees = chooseUsersFromGroups(owner, config.assigneeGroups, config.numberOfAssignees || config.numberOfReviewers)
  } else if (reviewers.length > 0) {
    assignees = config.assignees ?
      chooseUsers(config.assignees, config.numberOfAssignees || config.numberOfReviewers, owner)
      : reviewers
  }

  if (assignees.length > 0) {
    try {
      const params = context.issue({ assignees })
      const result: any = await context.github.issues.addAssignees(params)
      context.log(result)
    } catch (error) {
      context.log(error)
    }
  }
}
