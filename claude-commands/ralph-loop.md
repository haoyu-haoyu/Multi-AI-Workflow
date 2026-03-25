# Ralph Loop - Iterative AI Development Loop

Start a Ralph Loop that lets AI iterate continuously until the task is complete.

## Task
$ARGUMENTS

## How It Works

Ralph Loop continuously executes the following cycle:
1. Send prompt to AI
2. AI executes the task
3. Check output for completion marker
4. If not complete → continue to next iteration
5. AI can see its own previous work (files, git history)

## Command

```bash
cd $PWD && node ~/.maw/maw/bin/maw.js workflow ralph "$ARGUMENTS" \
  --max-iterations 30 \
  --completion-promise "COMPLETE" \
  --ai auto \
  --verbose
```

## Key Notes

- **Completion marker**: When the task is done, include `<promise>COMPLETE</promise>` in your response
- **Iteration philosophy**: Don't aim for perfection in one shot — improve through cycles
- **Failure is data**: Each iteration's failure informs the next attempt
- **Persistence wins**: Keep iterating until success

## Best Practices

1. **Clear completion criteria**: Define testable success criteria in the prompt
2. **Incremental goals**: Break complex tasks into stages
3. **Self-correction**: Include test/debug loops
4. **Safety limits**: Use --max-iterations as a safety net

## When to Use

✅ Good for:
- Tasks with clear success criteria
- Tasks that need iterative improvement
- Tasks with automated verification (tests, linters)

❌ Not ideal for:
- Tasks requiring human judgment
- One-shot operations
- Tasks with unclear standards
