### CI Environment to Test Mobile devices

#### Installation

Download the latest JXcore from [jxcore.azureedge.net/jxcore/0312/release/jx_osx64v8.zip](http://jxcore.azureedge.net/jxcore/0312/release/jx_osx64v8.zip)

```
git clone https://github.com/thaliproject/ThaliCI
cd ThaliCI
jx install
git clone https://github.com/ThaliTester/TestResults
```

- Define the worker `nodes` under `tasker/nodes.json` and `tasker/clean_nodes.sh`

- Define the builder VM under `builder/virtual.js`

- Reset the nodes

```
cd tasker
./clean_nodes.sh
cd ..
```

- Run
```
jx CI.js
```

#### Expectations

- Main machine is expected to be an OSX 10.10+ with latest XCode, Python 2.7, Github, and JXcore
- Nodes are Raspberry Pi 2+ with latest Raspbian (see tools folder for adb and jxcore)
- VM script is designed for VMWare Fusion
- 

#### Virtual Machine

Installed software
- XCode 7.2
- Node 6.3.1
- npm 3.10.3
- JXCore 0.3.1.2
- python 2.7.10
- Cordova 6.1.0
- JDK 1.7.0.79
- Android SDK
    * Android SDK tools 23.1
    * Android SDK tools 22.2
    * Android SDK tools 21.2
    * Android SDK tools 20.2
    * Android SDK tools 19.4
    * Android SDK tools 18.3
    * Android SDK tools 16.5
    * Android Support Repository 25
    * Android Support library 23.1.1
    * Google Repository 24

##### The other software
1. Install Homebrew - a package manager for OS X:
 <pre>
 /usr/bin/ruby -e "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/master/install)"
 </pre>
2. Install wget - software for retrieving files using HTTP, HTTPS and FTP:
 <pre>
 brew install wget
 </pre>
3. Install OpenSSL:
 <pre>
 brew install openssl
 brew link --force openssl
 </pre>
4. Install ssh-copy-id - a script that uses ssh to log on to a remote machine (coordination server):
 <pre>
 brew install ssh-copy-id
 brew link ssh-copy-id
 ssh-keygen -t rsa -b 4096
 ssh-copy-id -i ~/.ssh/id_rsa.pub pi@192.168.1.150
 </pre>

##### XCode

During the build process the application is code-signed. The code signing is used in combination with the app ID,
the provisioning profile, and entitlements to ensure that the installed application is trusted.

For details, see the 'App Distribution Guide', section
[Maintaining Your Signing Identities and Certificates](https://developer.apple.com/library/ios/documentation/IDEs/Conceptual/AppDistributionGuide/MaintainingCertificates/MaintainingCertificates.html).

_Note:_ Make sure that the private key used to sign the application has proper access:
- Go to Keychain, select System keychain and expand the certificate node (iPhone Developer).
- Right click on the private key and choose Get Info. On the Access Control tab choose _Allow all applications to access this item_.

When adding certificates using Xcode, it may happen that the private keys are stored both in the _login_ and in the _System_ keychains. Make sure that the key used for signing is stored only in the _System_ keychain, as the build is executed via the SSH with no access to the UI. Inproper setting will cause the signing to fail with an error "User interaction is not allowed."

##### Other settings

1. Update the bashrc and .bash_profile with:
 <pre>
 PATH="/Library/Frameworks/Python.framework/Versions/2.7/bin:/Users/thali/Library/Android/sdk/platform-tools:/Users/thali/Library/Android/sdk/build-tools/23.0.2:/Users/thali/Library/Android/ndk:/usr/local/bin:${PATH}"
 export ANDROID_HOME="/Users/thali/Library/Android/sdk"
 export PATH
 </pre>
2. Prepare CIGIVEMEMYIP.sh.
 
 CIGIVEMEMYIP.sh is a script executed by build.sh that prints out
 an appropriate test server IP address in CI.
 
 The example below shows how to prepare a file that prints out the IP address
 and then copy it to the '/usr/local/bin/':
 <pre>
 echo "83.16.22.81" > CIGIVEMEMYIP.sh
 vim CIGIVEMEMYIP.sh
 sudo cp CIGIVEMEMYIP.sh /usr/local/bin/
 </pre>
3. Configure npm to use Sinopia installed on the host machine:
 <pre>
 npm set registry http://192.168.1.100:4873
 npm adduser --registry http://192.168.1.100:4873
 </pre>

#### Adding devices

##### IOS

Each Apple device has to be added to the provisioning profile. Do the following:

1. Log on to the iOS dev center.
2. Go to the Device section under 'Certificates, Identifiers & Profiles'.
3. Add your device using its UDID. (You can get the UDID using XCode or iTunes.)
4. Update XCode with the updated provisioning profile. (Go to XCode --> Preferences --> Accounts --> ViewDetails -->Refresh.)


### Code of Conduct
This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/). For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.
