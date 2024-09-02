const WebSocket = require("ws");
const ssh = require("ssh2");
const AWS = require("aws-sdk");
const ec2 = new AWS.EC2();
AWS.config.update({
     region: "ap-southeast-2",
});

const websocketServer = new WebSocket.Server({ port: 3000 });
// websocketServer.timeout = 300000

websocketServer.on("connection", (ws) => {
     ws.on("message", (message) => {
          console.log(message);
          const commandParts = message.toString().split(" ");
          const command = commandParts[0];
          const args = commandParts.slice(1);
          const [machineIP, username, privateKeyPath] = args;

          if (command === "RUN") {
               const actualCommand = args.slice(3).join(" ");
               runCommand(ws, machineIP, username, privateKeyPath, actualCommand);
          } else if (command === "TERMINATE") {
               const instanceId = getInstanceIdByIP(machineIP);
               terminateInstance(instanceId);
          } else {
               ws.send("Invalid command");
          }
     });
});

console.log("WebSocket server listening on port 3000");

const runCommand = (ws, machineIP, username, privateKeyPath, command) => {
     console.log(privateKeyPath);
     console.log(machineIP, username, privateKeyPath, command);
     const conn = new ssh.Client();

     conn.on("ready", () => {
          console.log("ready");
          conn.exec(command, (err, stream) => {
               if (err) {
                    console.error("Error running command:", err);
                    ws.send("Error running command");
               } else {
                    let output = "";
                    stream.on("data", (data) => {
                         console.log("Data event triggered");
                         console.log("data:", data.toString());
                         ws.send(data.toString());
                    });

                    // Capture stderr data
                    stream.stderr.on("data", (data) => {
                         console.log("StdErr event triggered");
                         output = data.toString(); // Accumulate error chunks
                         console.log("std err data: ", output);
                         ws.send(output);
                    });

                    stream.on("exit", (code, signal) => {
                         console.log("Exit event triggered");
                         console.log(code, signal);
                    });

                    stream.on("end", () => {
                         console.log("End event triggered");
                    });

                    stream.on("close", (code) => {
                         console.log("Close event triggered");
                         conn.end();
                    });
               }
          });
     });

     conn.on("error", (error) => {
          console.log("conn::error triggered");
          console.log(error);
     });

     conn.on("end", () => {
          console.log("conn::end triggered");
     });

     conn.on("close", () => {
          console.log("conn::close triggered");
     });

     conn.connect({
          host: machineIP,
          port: 22,
          username,
          privateKey: require("fs").readFileSync(privateKeyPath),
     });
};

const terminateInstance = (instanceId) => {
     ec2.terminateInstances({ InstanceIds: [instanceId] }, (err, data) => {
          if (err) {
               console.error("Error terminating instance:", err);
          } else {
               console.log("Instance terminated:", data);
          }
     });
};

const getInstanceIdByIP = (ip) => {
     const params = {
          Filters: [
               {
                    Name: "ipAddress",
                    Values: [ip],
               },
          ],
     };

     return new Promise((resolve, reject) => {
          ec2.describeInstances(params, (err, data) => {
               if (err) {
                    reject(err);
               } else {
                    const instances = data.Reservations.map((reservation) => reservation.Instances).flat();
                    const instance = instances.find((instance) => instance.PublicIpAddress === ip);

                    if (instance) {
                         resolve(instance.InstanceId);
                    } else {
                         reject(`Instance with IP ${ip} not found`);
                    }
               }
          });
     });
};
