<#
.SYNOPSIS
    Starts all DoctorNow backend microservices and the API Gateway in a single terminal.
.EXAMPLE
    .\start-all.ps1
.EXAMPLE
    .\start-all.ps1 -Core
.EXAMPLE
    .\start-all.ps1 -Services "gateway,auth,profile"
#>

param (
    [switch]$Core,
    [string]$Services,
    [string]$Exclude,
    [switch]$List,
    [switch]$Help
)

$argsList = @()

if ($Help) {
    $argsList += "--help"
}
if ($List) {
    $argsList += "--list"
}
if ($Core) {
    $argsList += "--core"
}
if ($Services) {
    $argsList += "--only=$Services"
}
if ($Exclude) {
    $argsList += "--exclude=$Exclude"
}

node "$PSScriptRoot\dev-runner.js" @argsList
