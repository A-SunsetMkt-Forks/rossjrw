import { Octokit } from "@octokit/rest"
import { Context } from "@actions/github/lib/context"
import { default as _core } from "@actions/core"
import Ur from "ur-game"

import { addReaction } from '@/issues'
import { handleError } from '@/error'
import { resetGame, makeMove } from '@/doAction'

export default async function play (
  title: string,
  octokit: Octokit,
  context: Context,
  core: typeof _core,
): Promise<void> {
  /**
   * Let's play Ur!
   *
   * This project is inspired by timburgan/timburgan - thank you Tim!
   *
   * Recieves parameters from actions/github-script:
   * @param title: The title of the triggering issue.
   * @param octokit: octokit/rest.js client.
   * @param context: Workflow context object.
   * @returns void: At least until I work out what this should do!
   */
  // The Octokit client comes pre-authenticated, so there's no need to
  // instantiate it.

  // First thing to do: add a reaction to the triggering commit to acknowledge
  // that we've seen it.
  // TODO React with a rocket once the issue has been actioned.

  const gamePath = "games/current"

  try {
    addReaction("eyes", octokit, context)
    // Parse the issue's title into a concrete action
    const [command, move, gameId] = parseIssueTitle(title)
    const state = await getGameState(gamePath, octokit, context)
    if (command === "new") {
      resetGame(gamePath, octokit, context)
    } else if (command === "move") {
      makeMove(state, move, gamePath, octokit, context)
    }
  } catch (error) {
    // If there was an error, forward it to the user, then stop
    handleError(error, octokit, context, core)
    return
  }
}

function parseIssueTitle (
  title: string,
): ["new" | "move", string, number] {
  /**
   * Parses the issue title into move instructions.
   *
   * @param title: The title of the issue.
   */
  const [gamename, command, move, gameId] = title.split("-")
  if (!gamename || gamename !== "ur") {
    throw new Error('WRONG_GAME')
  }
  if (!command || !["new", "move"].includes(command)) {
    throw new Error('UNKNOWN_COMMAND')
  }
  if (command === "move") {
    if (!move) {
      throw new Error('NO_MOVE_GIVEN')
    }
    if (!gameId) {
      throw new Error('NO_ID_GIVEN')
    }
    if (!/\d+@\d+/.test(move)) {
      throw new Error('MOVE_BAD_FORMAT')
    }
    if(isNaN(parseInt(gameId))) {
      throw new Error('NON_NUMERIC_ID')
    }
  }
  return [command as "new" | "move", move, parseInt(gameId)]
}

async function getGameState (
  gamePath: string,
  octokit: Octokit,
  context: Context,
): Promise<Ur.State> {
  /**
   * Gets the current game state as stored on file.
   */
  // const gamePath = "games/current"

  // Grab the content of the current board from file
  let stateFile
  try {
    stateFile = await octokit.repos.getContent({
      owner: context.issue.owner,
      repo: context.issue.repo,
      ref: "play",
      path: `${gamePath}/state.json`,
      mediaType: { format: "raw" },
    })
  } catch (error) {
    if (error.status === 404) {
      // There is no game, so create it
      // This situation probably shouldn't be able to happen
      // state = Ur.startGame(7, 4, Ur.BLACK) // TODO get player team
      throw error
    } else {
      throw error
    }
  }
  const state = JSON.parse(
    Buffer.from(stateFile.data.content, "base64").toString()
  )
  return state
}

