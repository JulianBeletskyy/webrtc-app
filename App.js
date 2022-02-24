  /**
   * Sample React Native App
   * https://github.com/facebook/react-native
   *
   * @format
   * @flow strict-local
   */

  import React, { useState, useRef, useEffect } from 'react'
  import { SafeAreaView, StyleSheet, View, Pressable, Text, Platform, KeyboardAvoidingView } from 'react-native'
  import { accelerometer, gyroscope, magnetometer, orientation, setUpdateIntervalForType, SensorTypes } from 'react-native-sensors'
  import {
    RTCPeerConnection,
    RTCMediaStream,
    RTCIceCandidate,
    RTCSessionDescription,
    RTCView,
    MediaStreamTrack,
    getUserMedia,
  } from 'react-native-webrtc'
  import io from 'socket.io-client'
  import QRCodeScanner from 'react-native-qrcode-scanner'
import { RNCamera } from 'react-native-camera'

  const configuration = {"iceServers": [{"url": "stun:stun.l.google.com:19302"}]}
  const pcPeers = {}

  setUpdateIntervalForType(SensorTypes.accelerometer, 100)
  setUpdateIntervalForType(SensorTypes.gyroscope, 500)

  export function quaternionToAngles(q) {
    let data = q;

    let ysqr = data.y * data.y;
    let t0 = -2.0 * (ysqr + data.z * data.z) + 1.0;
    let t1 = +2.0 * (data.x * data.y + data.w * data.z);
    let t2 = -2.0 * (data.x * data.z - data.w * data.y);
    let t3 = +2.0 * (data.y * data.z + data.w * data.x);
    let t4 = -2.0 * (data.x * data.x + ysqr) + 1.0;

    t2 = t2 > 1.0 ? 1.0 : t2;
    t2 = t2 < -1.0 ? -1.0 : t2;

    const toDeg = 180 / Math.PI;

    const euler = {};
    euler.pitch = Math.asin(t2) * toDeg;
    euler.roll = Math.atan2(t3, t4) * toDeg;
    euler.yaw = Math.atan2(t1, t0) * toDeg;

    return euler;
  }

  const App = () => {
    const subscriptions = useRef({})
    const peerRef = useRef()
    const sendChannel = useRef()
    const socketRef = useRef()
    const otherUser = useRef()

    const [sending, setSending] = useState(false)
    const [roomId, setRoomId] = useState('')
    const [connected, setConnected] = useState(false)
    const [showScanner, setShowScanner] = useState(false)
    const [accelerometerData, setAccelerometerData] = useState({x: 0, y: 0, z: 0, timestamp: 0})
    const [gyroscopeData, setGyroscopeData] = useState({x: 0, y: 0, z: 0, timestamp: 0})
    const [orientationData, setOrientationData] = useState({qx: 0, qy: 0, qz: 0, qw: 0, pitch: 0, roll: 0, yaw: 0, timestamp: 0})
    // const [magnetometerData, setMagnetometrerData] = useState({x: 0, y: 0, z: 0, timestamp: 0})
    // const [positions, setPositions] = useState({x: 0, y: 0, z: 0})
    // const [speed, setSpeed] = useState(0)

    useEffect(() => {
      socketRef.current = io.connect(
        'https://ws.qvady.dev',
        { transports: ['websocket'] }
      )
      socketRef.current.on('connect', () => {
        console.log('connected updated')
      })
      socketRef.current.on('connect_error', error => {
        Object.keys(error).forEach(key => {
          console.log(key, ' -> ', error[key])
        })
        // console.log('error', )
      })
    }, [])

    useEffect(() => {
      if (connected) {
        subscribeSensors()
      } else {
        unsubscribeSensors()
      }
    }, [connected, Platform.OS])

    const initSocket = roomID => {
      socketRef.current.emit("join room", roomID)
      socketRef.current.on("other user", userID => {
        callUser(userID)
        console.log('other user ', userID)
        otherUser.current = userID;
        // setConnected(true)
      });

      // Signals that both peers have joined the room
      socketRef.current.on("user joined", userID => {
        console.log('user joined', userID)
        otherUser.current = userID;
      });

      socketRef.current.on("offer", handleOffer)
      
      socketRef.current.on("answer", handleAnswer)

      socketRef.current.on("ice-candidate", handleNewICECandidateMsg)
    }

    function callUser(userID){
      // This will initiate the call
      console.log("[INFO] Initiated a call", Platform.OS)
      peerRef.current = Peer(userID);
      sendChannel.current = peerRef.current.createDataChannel("sendChannel");
      
      // listen to incoming messages
      sendChannel.current.onmessage = handleReceiveMessage;
      setConnected(true)
    }

    function Peer(userID) {
      const peer = new RTCPeerConnection({
        iceServers: [
            {
                urls: "stun:stun.stunprotocol.org"
            },
            {
                urls: 'turn:numb.viagenie.ca',
                credential: 'muazkh',
                username: 'webrtc@live.com'
            },
          ]
        });
      peer.onicecandidate = handleICECandidateEvent;
      peer.onnegotiationneeded = () => handleNegotiationNeededEvent(userID);

      return peer;
    }

    function handleNegotiationNeededEvent(userID){
      // Make Offer
      peerRef.current.createOffer().then(offer => {
        return peerRef.current.setLocalDescription(offer);
      })
      .then(() => {
        const payload = {
          target: userID,
          caller: socketRef.current.id,
          sdp: peerRef.current.localDescription,
        };
        socketRef.current.emit("offer", payload);
      })
      .catch(err => console.log("Error handling negotiation needed event", err));
    }

    function handleOffer(incoming) {
      // Handle Offer made by the initiating peer
      console.log("[INFO] Handling Offer")
      peerRef.current = Peer();
      peerRef.current.ondatachannel = (event) => {
        sendChannel.current = event.channel;
        sendChannel.current.onmessage = handleReceiveMessage;
        console.log('[SUCCESS] Connection established', Platform.OS)
        setConnected(true)
      }

      const desc = new RTCSessionDescription(incoming.sdp)
      peerRef.current.setRemoteDescription(desc).then(() => {
      }).then(() => {
        return peerRef.current.createAnswer()
      }).then(answer => {
        return peerRef.current.setLocalDescription(answer)
      }).then(() => {
        const payload = {
          target: incoming.caller,
          caller: socketRef.current.id,
          sdp: peerRef.current.localDescription
        }
        socketRef.current.emit("answer", payload)
      })
    }

    function handleAnswer(message){
      // Handle answer by the remote peer
      const desc = new RTCSessionDescription(message.sdp);
      peerRef.current.setRemoteDescription(desc).catch(e => console.log("Error handle answer", e));
    }

    
    function handleReceiveMessage(e){
      // console.log("[INFO] Message received from peer", Platform.OS);
      // console.log(typeof e.data)
      // setAccelerometerData(JSON.parse(e.data))
      // const msg = [{
      //   _id: Math.random(1000).toString(),
      //   text: e.data,
      //   createdAt: new Date(),
      //   user: {
      //     _id: 2,
      //   },
      // }];
      // setMessages(previousMessages => GiftedChat.append(previousMessages, msg))
      // setMessages(messages => [...messages, {yours: false, value: e.data}]);
    };

    function handleICECandidateEvent(e) {
      if (e.candidate) {
          const payload = {
              target: otherUser.current,
              candidate: e.candidate,
          }
          socketRef.current.emit("ice-candidate", payload);
      }
    }

    function handleNewICECandidateMsg(incoming) {
      const candidate = new RTCIceCandidate(incoming);

      peerRef.current.addIceCandidate(candidate)
          .catch(e => console.log(e));
    }

    const handlePressButton = () => {
      if (roomId) {
        initSocket(roomId)
      }
      // if (!sending) {
      //   subscribeSensors()
      // } else {
      //   unsubscribeSensors()
      // }
      // setSending(!sending)
    }

    const subscribeSensors = () => {
      subscriptions.current.accelerometer = accelerometer.subscribe((data) => {
        setAccelerometerData(data)
        sendChannel.current.send(JSON.stringify({accelerometer: data}))
        // const payload = {
        //   target: otherUser.current,
        //   data: data,
        // }
        // socketRef.current.emit("message", payload);
      })
      subscriptions.current.gyroscope = gyroscope.subscribe((data) => {
        setGyroscopeData(data)
        sendChannel.current.send(JSON.stringify({gyroscope: data}))
      })
      subscriptions.current.orientation = orientation.subscribe((data) => {
        // const { qx, qy, qz, qw, pitch, roll, yaw, timestamp } = data
        setOrientationData(data)
        sendChannel.current.send(JSON.stringify({orientation: data}))
      })
       // subscriptions.current.magnetometer = magnetometer.subscribe(({ x, y, z, timestamp }) => {
      //   const data = { x, y, z, timestamp }
      //   setMagnetometrerData(data)
      //   // sendChannel.current.send(JSON.stringify({accelerometer: data}))
      // })
    }

    const unsubscribeSensors = () => {
      if (subscriptions.current.accelerometer && subscriptions.current.gyroscope && subscriptions.current.orientation) {
        subscriptions.current.accelerometer.unsubscribe()
        subscriptions.current.gyroscope.unsubscribe()
        subscriptions.current.orientation.unsubscribe()
      }
      // subscriptions.current.magnetometer.unsubscribe()
    }

    const onSuccessScan = (e) => {
      setRoomId(e.data)
      setShowScanner(false)
      initSocket(e.data)
    }

    const handleScanRoomId = () => {
      setShowScanner(true)
    }

    const handleDisconnect = () => {
      setConnected(false)
      setRoomId('')
      peerRef.current.close()
    }

    return (
      <SafeAreaView style={styles.container}>
        <View style={[styles.container, {paddingVertical: 20, paddingHorizontal: 20}]}>
          <View style={{width: '100%', flexDirection: 'row'}}>
            <View style={{flex: 1}}>
              <Text style={{fontWeight: 'bold'}}>Accelerometer</Text>
              <Text>X: {accelerometerData.x.toFixed(2)}</Text>
              <Text>Y: {accelerometerData.y.toFixed(2)}</Text>
              <Text>Z: {accelerometerData.z.toFixed(2)}</Text>
            </View>
            <View style={{flex: 1}}>
              <Text style={{fontWeight: 'bold'}}>Gyroscope</Text>
              <Text>X: {gyroscopeData.x.toFixed(2)}</Text>
              <Text>Y: {gyroscopeData.y.toFixed(2)}</Text>
              <Text>Z: {gyroscopeData.z.toFixed(2)}</Text>
            </View>
            <View style={{flex: 1}}>
              <Text style={{fontWeight: 'bold'}}>Orientation</Text>
              <Text>pitch: {orientationData.pitch.toFixed(2)}</Text>
              <Text>roll: {orientationData.roll.toFixed(2)}</Text>
              <Text>yaw: {orientationData.yaw.toFixed(2)}</Text>
              <Text>QX: {orientationData.qx.toFixed(2)}</Text>
              <Text>QY: {orientationData.qy.toFixed(2)}</Text>
              <Text>QZ: {orientationData.qz.toFixed(2)}</Text>
              <Text>QW: {orientationData.qw.toFixed(2)}</Text>
            </View>
          </View>
          {
            showScanner
              ? <QRCodeScanner
                  onRead={onSuccessScan}
                  cameraStyle={{width: '100%'}}
                  flashMode={RNCamera.Constants.FlashMode.auto} />
              : <Text style={{fontSize: 42, fontWeight: 'bold'}}>Room: {roomId}</Text>
          }
          <View style={{marginTop: 'auto'}}>
            {
              !roomId
                ? <Pressable style={styles.button} onPress={handleScanRoomId}>
                    <Text>Scan QR-code</Text>
                  </Pressable>
                : roomId && connected
                  ? <Pressable style={styles.button} onPress={handleDisconnect}>
                      <Text>Disconnect</Text>
                    </Pressable>
                  : null
            }
            
          </View>
        </View>
      </SafeAreaView>
    );
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
    },
    button: {
      marginLeft: 'auto',
      marginRight: 'auto',
      borderWidth: 1,
      borderRadius: 10,
      height: 45,
      width: 200,
      alignItems: 'center',
      justifyContent: 'center',
    },
    input: {
      borderWidth: 1,
    },
    box: {
      height: 100,
      width: 100,
      borderRadius: 5,
      marginVertical: 40,
      backgroundColor: "#61dafb",
      alignItems: "center",
      justifyContent: "center"
    }
  })

  export default App
