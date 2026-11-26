# Run a console command for each row of a CSV file

The Developer Console can run any of its commands once per row of a CSV file.
If you have used `gam csv`, this is the same idea.

Use it when the Bulk Operations page does not have an operation for what you
need. Bulk Operations runs on the server and suits large user imports; this
runs in your browser and suits everything else the console can do.

## The three steps

```
csv load
csv preview gw users update ~email --jobTitle=~title
csv run gw users update ~email --jobTitle=~title
```

1. **`csv load`** opens a file chooser. The console prints the row count and
   the column names.
2. **`csv preview <command>`** shows the first five commands that would run and
   the total. Nothing runs.
3. **`csv run <command>`** runs the command once per row, in file order, and
   ends with a summary that lists the rows that failed. It only runs a command
   you have just previewed, written the same way.

`csv show` prints the loaded file's columns. `csv clear` forgets the file.

## Writing the command

Write `~column` where a value from the file belongs.

| In the command | Meaning |
|---|---|
| `~email` | The value of the `email` column for this row |
| `~{First Name}` | A column whose name has spaces |
| `~~` | A literal `~` |

Column names are matched without regard to letter case. You do not need to add
quotes around a placeholder: a value with spaces stays one argument.

A value from the file can never add a flag to the command. If a cell contains
`--confirm`, it is passed as text, not read as a flag.

## The file

- The first line names the columns. Every later line is one row.
- Comma-separated, UTF-8. Values may be quoted; a quoted value may contain
  commas, line breaks and doubled quotes (`""`).
- Every row must have the same number of values as the header.
- Limits: 2,000 rows and 5 MB. Split a larger file and run each part.

Example:

```csv
email,title,ou
ana@example.com,Analyst,/Staff/Finance
ben@example.com,"Lead, Platform",/Staff/Engineering
```

## Where the file goes

Nowhere. The file is read by your browser and kept in the page's memory until
you run `csv clear`, load another file, or close the page. It is not uploaded
to the Helios server and it is not written to disk.

The audit log records the `csv run` command as you typed it, with the column
placeholders, not the values. Each change a row makes is recorded as usual.

Values from columns whose name contains `pass`, `secret`, `token` or `pin` are
shown as `********` in the console output. The real value is still sent.

## Destructive commands

A command that needs `--confirm` on its own still needs it here:

```
csv preview gw users delete ~email --confirm
csv run gw users delete ~email --confirm
```

The preview step is the check: read the previewed commands before running.

## Stopping and failures

- By default a failed row is reported and the run continues.
- `csv run --stop-on-error <command>` stops at the first failed row.
- The **Stop** button in the console toolbar stops after the current row.
- The summary gives the row numbers that failed. Row 1 is the first line after
  the header. To retry, make a file with only those rows.

Rows run one at a time. Keep the page open until the summary appears; closing
it stops the run, and the rows already done stay done.

## Examples

```
csv preview gw users move ~email --ou=~ou
csv preview gw groups add-member ~group ~email
csv preview gw users add-alias ~email ~alias
csv preview gw users suspend ~email
```

## What it does not do

- It does not run from a terminal or on a schedule. For that, call the Helios
  API from a script.
- It does not undo. A run that changed 40 rows before failing has changed 40
  rows.
