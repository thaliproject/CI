### CI Environment to Test Mobile devices

#### Installation

Download the latest JXcore from [jxcore.com/downloads](http://jxcore.com/downloads)

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
### Code of Conduct
This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/). For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.
