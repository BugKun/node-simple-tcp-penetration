const fs = require('fs');
const net = require('net');
const JSON5 = require('json5');
const configPath = './client-config.json5';

// 配置
let CONFIG = {};

function parseConfig() {
    try {
        CONFIG = JSON5.parse(
            fs.readFileSync(configPath)
        );
    } catch(e) {
        console.log(e)
    }
}

parseConfig()

// 用于校验请求的code
let CODE;
let linkClient;
function listenClient() {
    // 创建用于连接校验服务端的 客户端连接
    linkClient = net.createConnection({ port: CONFIG.server_port, host: CONFIG.server_addr }, () => {
        // 创建用于校验请求的code
        CODE = (+new Date());
        // 发送数据校验
        linkClient.write(JSON.stringify({ token: CONFIG.token, code: CODE, type: 'register', binds: CONFIG.binds }));
        console.log(`[${(new Date()).toLocaleString()}] 正在尝试连接...`);
    });
    linkClient.setTimeout(CONFIG.timeout);
    linkClient.on('data', (data) => {
        try {
            data = JSON.parse(data);
            // 校验请求
            if (data.code == CODE) {
                if (data.type == 'register') {
                    console.log(`[${(new Date()).toLocaleString()}] 已连接到服务器 ${CONFIG.server_addr}:${CONFIG.server_port}`);
                } else {
                    // 请求标识
                    let key = data.key;
                    // 应用名称
                    let name = data.name;
                    // 本地的应用
                    let localApp = CONFIG.binds[name];
                    if (!localApp) linkClient.end();
                    // 创建服务端用的Socket
                    let serverClient = new net.Socket();
                    serverClient.setTimeout(CONFIG.timeout);
                    // 创建局域网内的Socket
                    let localClient = new net.Socket();
                    localClient.setTimeout(CONFIG.timeout);

                    // 连接服务端
                    serverClient.connect(CONFIG.server_port, CONFIG.server_addr, function () {
                        serverClient.write(JSON.stringify({ type: 'connect', key: key }));
                        // 连接本地服务器
                        localClient.connect(localApp.local_port, localApp.local_ip, function () {
                            console.log(`[${(new Date()).toLocaleString()}] [${name}] ${localApp.local_port}<===>${localApp.remote_port}`);
                        });
                        // 本地数据转发服务端
                        localClient.pipe(serverClient);
                        localClient.on('end', function (data) {
                            serverClient.end();
                        });
                    })
                    serverClient.on('error', function (err) {
                        console.error(`[${(new Date()).toLocaleString()}] 访问服务器异常，${err.message}`);
                        localClient.end();
                    })
                    localClient.on('error', function (err) {
                        console.error(`[${(new Date()).toLocaleString()}] 局域网访问异常，${err.message}`);
                        serverClient.end();
                    });
                    // 服务端数据转发本地
                    serverClient.pipe(localClient);
                    serverClient.on('end', function (data) {
                        localClient.end();
                    });
                }
                return;
            }
        } catch (error) {
            // 异常
        }
        return linkClient.end();
    });
    linkClient.on('error', (err) => {
        console.error(`[${(new Date()).toLocaleString()}] 异常:` + err.message);
    });
    linkClient.on('end', () => {
        console.log(`[${(new Date()).toLocaleString()}] 已从服务器 ${CONFIG.server_port}:${CONFIG.server_port} 断开`);
    });
}


//异常重试
listenClient()
setInterval(() => {
    if (linkClient.readyState == "closed") {
        linkClient.end();
        console.log(`[${(new Date()).toLocaleString()}] 正在重新连接服务器...`);
        listenClient();
    }
}, CONFIG.interval);


fs.watch(configPath, (eventType) => {
    console.log('config changed: => ' + eventType)
    if(/change|rename/.test(eventType)) {
        parseConfig()
        listenClient()
    }
})
