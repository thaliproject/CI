# Communication between the CI system, GitHub and the Test Server

The CI system is intended to run tests any time a PR is created or updated with a commit. There is a very specific
life cycle for such tests. That life cycle is tracked and reported to GitHub as follows.

## Job submission
When the CI system detects a PR or commit update it will immediately send a message to the PR in GitHub stating
that the job has been accepted. The commit message MUST be of the form:

"Job X.Y has been added to queue for testing"

X MUST be the internal test ID used to track all tests related to the PR.
Y MUST be a string unique to a particular commit. This ID SHOULD be the first 6 characters of the commit's Git ID.

## Build Output
### Unified Build Script
If there is a single build script then output is handled as defined in this section.

If the build has completed successfully then a message MUST be added to the GitHub pull request of the following form:

"Job X.Y has successfully built, the build output is available here" where here is a link to the log for the build.

If the build has failed then a message MUST be added to the GitHub pull request of the following form:

"Job X.Y has FAILED build, the build output is available here" where here is a link to the log for the build.

### Split Build Script
It is possible to specify build scripts separately for iOS and Android. Currently we do not use this split so we won't
worry about how it should be output.

## Test Output
Android and iOS tests are run separately and so their results should be reported separately as they become available.

When either Android or iOS test results become available they MUST be reported to the GitHub PR as follows in the case
of success:

"Job X.Y for platform Z has succeeded."

'Z' can be either iOS or Android.
 
If the test failed due to a reported failure then the message MUST be:

"Job X.Y for platform Z has failed due to err [MSG]"

Where [MSG] is the message returned by the coordination server via console.log.

If the job failed due to a global time out then the message MUST be:

"Job X.Y for platform Z has failed due to failing to complete within the configured timeout of [X] seconds"

Where [X] was the configured maximum number of seconds the test was allowed to run.

All test results, successful or not, MUST include the following information at the end:

```
Total Test Run Time: D seconds

Build Server - log

Coordination Server - log

# Devices that were successfully provisioned and their log output
Device [Name] - log
Device [Name] - log
...
Device [Name] - log

# Devices that were not successfully provisioned and their log output
Device [Name] - log
...
Device [Name] - log
```

In each case log MUST be a hyperlink to the log output for the identified entity. So the first log should be to the
build server (the one running in a VM). The second log should be for the output of the coordination server (what
we also call the Test Server). The remaining log outputs should be for each of the devices. If there is no log output
(for example, the build server wasn't able to successfully talk to a Raspberry PI or the Raspberry PI couldn't get
any logs) then the log link should not be a hyperlink. This indicates that no log could be collected.

In the results each device's unique name MUST be supplied in the [Name] field.

Note that the section on 'no successfully provisioned' only applies in those cases where the build server can detect
that something went wrong in trying to provision the device. For example, the build server unexpectedly couldn't talk to 
the relevant Raspberry PI or the Raspberry PI couldn't successfully deploy to the device. It is still possible
for the devices to appear to be provisioned to the build server but to experience other failures that prevent
them from successfully communicating to the Test Server. It is up to the Test Server to handle that scenario. In so
far as the CI system is concerned if it was able to deploy to a device then the device is 'successful' and must be
included in the 'successfully provisioned' section.

# Communication between the CI system and the Test Server
When the CI system starts the Test Server (aka the Coordination Server) it will pass in on the command line the
number of devices that the CI system believes should be available. This number is calculated before attempting to
deploy to the devices.

In other words, imagine that the CI system is supposed to have 40 Android devices. And imagine that there is a known
problem with one of the Raspberry PIs that is keeping 4 of the Android devices from being reachable. This is known
before a test is submitted and is an ongoing problem. In that case the CI system would pass in on the command line
that there are only 36 Android devices.

Now it is completely possible that when the CI system tries to deploy to those 36 Android devices that say only 30
of them are successfully provisioned by the CI system. This means that in the final job output the CI system will
list 30 devices in the 'successfully provisioned' section and 6 devices in the 'not successfully provisioned'
section. But the fact that 30 devices were successfully provisioned and 6 devices were not will not ever be directly
communicated to the Test Server. The Test Server will have its own logic for determining how many devices are around.

# Future features
The following are features that we may want to eventually add but are not supporting today.

## Reporting when deployment is complete
It would probably be useful if the CI system could report both in GitHub and to the Test Server when it has finished
deploying to whatever devices it can. This will help the Test Server have a more accurate timing for waiting for
devices to show up and will give the developer a sense for how the tests are going.

## Reporting to the Test Server the complete list of device names along with their deployment status
It might eventually be useful for the CI system to tell the Test Server what devices there are (by name) as well as
what their deployment status is. That could potentially help with managing tests. But it's not important enough to
bother with now.

## Reporting logs for devices early
It would be really useful if each test run immediately sent a link to GitHub that would open a HTML page that would
provide the latest update to the 'successfully provisioned' and 'not successfully provisioned' results with a third
section 'not provisioned yet. The developer
could refresh (or the page could auto-refresh) the page to see which devices are getting deployed to and which are not.
The log links could also be live so that the developer can see log output in near real time as the tests are being run.

## Kill Button
It would be useful to have a way to kill a job immediately when it's clear that the job isn't going as desired.