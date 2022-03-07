  /**
   * Sample React Native App
   * https://github.com/facebook/react-native
   *
   * @format
   * @flow strict-local
   */

import React, { useState, useRef, useEffect } from 'react'
import { SafeAreaView, StyleSheet, View, Pressable, Text, Platform } from 'react-native'
import { orientation } from 'react-native-sensors'
import { RTCPeerConnection, RTCIceCandidate, RTCSessionDescription } from 'react-native-webrtc'
import io from 'socket.io-client'
import QRCodeScanner from 'react-native-qrcode-scanner'
import { RNCamera } from 'react-native-camera'
import { request, PERMISSIONS, RESULTS } from 'react-native-permissions'
import KeepAwake from 'react-native-keep-awake'

import Stats from './src/components/Stats'

  // export function quaternionToAngles(q) {
  //   let data = q;

  //   let ysqr = data.y * data.y;
  //   let t0 = -2.0 * (ysqr + data.z * data.z) + 1.0;
  //   let t1 = +2.0 * (data.x * data.y + data.w * data.z);
  //   let t2 = -2.0 * (data.x * data.z - data.w * data.y);
  //   let t3 = +2.0 * (data.y * data.z + data.w * data.x);
  //   let t4 = -2.0 * (data.x * data.x + ysqr) + 1.0;

  //   t2 = t2 > 1.0 ? 1.0 : t2;
  //   t2 = t2 < -1.0 ? -1.0 : t2;

  //   const toDeg = 180 / Math.PI;

  //   const euler = {};
  //   euler.pitch = Math.asin(t2) * toDeg;
  //   euler.roll = Math.atan2(t3, t4) * toDeg;
  //   euler.yaw = Math.atan2(t1, t0) * toDeg;

  //   return euler;
  // }

  const App = () => {
    const subscriptions = useRef({})
    const peerRef = useRef()
    const sendChannel = useRef()
    const socketRef = useRef()
    const otherUser = useRef()
    const stats = useRef(null)

    const [cameraPermission, setCameraPermission] = useState(null)
    const [roomId, setRoomId] = useState('')
    const [connected, setConnected] = useState(false)
    const [showScanner, setShowScanner] = useState(false)
    const [orientationData, setOrientationData] = useState({qx: 0, qy: 0, qz: 0, qw: 0, pitch: 0, roll: 0, yaw: 0, timestamp: 0})

    useEffect(() => {
      switch (Platform.OS) {
        case 'ios':
          request(PERMISSIONS.IOS.CAMERA).then(setCameraPermission)
          break
        case 'android':
          request(PERMISSIONS.ANDROID.CAMERA).then(setCameraPermission)
          break
        default:
          return
      }
      socketRef.current = io.connect(
        'https://ws.qvady.dev',
        { transports: ['websocket'] }
      )
      socketRef.current.on('connect', () => {
        console.log('connected updated')
      })
      socketRef.current.on('connect_error', error => {
        Object.keys(error).forEach(key => console.log(key, ' -> ', error[key]))
      })
    }, [])

    useEffect(() => {
      if (connected) {
        subscribeSensors()
        KeepAwake.activate()
      } else {
        unsubscribeSensors()
        KeepAwake.deactivate()
      }
    }, [connected])

    const initSocket = roomID => {
      socketRef.current.emit('join room', roomID)
      socketRef.current.on('other user', userID => {
        callUser(userID)
        otherUser.current = userID
        // setConnected(true)
      })
      socketRef.current.on('user joined', userID => otherUser.current = userID)
      socketRef.current.on('offer', handleOffer)
      socketRef.current.on('answer', handleAnswer)
      socketRef.current.on('ice-candidate', handleNewICECandidateMsg)
    }

    function callUser(userID){
      peerRef.current = Peer(userID)
      sendChannel.current = peerRef.current.createDataChannel('sendChannel')
      sendChannel.current.onmessage = handleReceiveMessage;
      setConnected(true)
    }

    function Peer(userID) {
      const peer = new RTCPeerConnection({
        iceServers: [
          {
            urls: 'stun:stun.stunprotocol.org'
          },
          {
            urls: 'turn:numb.viagenie.ca',
            credential: 'muazkh',
            username: 'webrtc@live.com'
          },
        ]
      })
      peer.onicecandidate = handleICECandidateEvent;
      peer.onnegotiationneeded = () => handleNegotiationNeededEvent(userID)
      return peer
    }

    function handleNegotiationNeededEvent(userID){
      peerRef.current.createOffer().then(offer => {
        return peerRef.current.setLocalDescription(offer)
      })
      .then(() => {
        const payload = {
          target: userID,
          caller: socketRef.current.id,
          sdp: peerRef.current.localDescription,
        }
        socketRef.current.emit('offer', payload)
      })
      .catch(err => console.log('Error handling negotiation needed event', err))
    }

    function handleOffer(incoming) {
      peerRef.current = Peer()
      peerRef.current.ondatachannel = event => {
        sendChannel.current = event.channel
        sendChannel.current.onmessage = handleReceiveMessage
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
        socketRef.current.emit('answer', payload)
      })
    }

    function handleAnswer(message){
      const desc = new RTCSessionDescription(message.sdp)
      peerRef.current.setRemoteDescription(desc).catch(e => console.log('Error handle answer', e))
    }
    
    function handleReceiveMessage(e){
      // console.log("[INFO] Message received from peer", Platform.OS)
    };

    function handleICECandidateEvent(e) {
      if (e.candidate) {
        const payload = {
          target: otherUser.current,
          candidate: e.candidate,
        }
        socketRef.current.emit('ice-candidate', payload)
      }
    }

    function handleNewICECandidateMsg(incoming) {
      const candidate = new RTCIceCandidate(incoming)
      peerRef.current.addIceCandidate(candidate).catch(e => console.log(e))
    }

    const subscribeSensors = () => {
      subscriptions.current.orientation = orientation.subscribe(data => {
        // const { qx, qy, qz, qw } = data
        const qx = Math.sin(data.qx/2) //data.qx
        const qy = Math.sin(data.qy/2) //data.qy
        const qz = Math.sin(data.qz/2) //data.qz
        const qw = Math.sin(data.qw/2) //data.qw
        stats.current.draw({ qx, qy, qz, qw })
        sendChannel.current.send(JSON.stringify({type: 'orientation', data: {x: qx, y: qy, z: qz, w: qw}}))
      })
    }

    const unsubscribeSensors = () => {
      if (subscriptions.current.orientation) {
        subscriptions.current.orientation.unsubscribe()
      }
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
              <Stats ref={stats} />
            </View>
          </View>
          {
            showScanner
              ? <QRCodeScanner
                  onRead={onSuccessScan}
                  cameraStyle={{width: '100%'}}
                  flashMode={RNCamera.Constants.FlashMode.auto} />
              : <View>
                  <Text style={{fontSize: 42, fontWeight: 'bold', textAlign: 'center'}}>Room</Text>
                  <Text style={{fontSize: 42, fontWeight: 'bold', textAlign: 'center'}}>{roomId}</Text>
                </View>
          }
          <View style={{marginTop: 'auto'}}>
            {
              !roomId
                ? cameraPermission === RESULTS.GRANTED
                  ? <Pressable style={styles.button} onPress={handleScanRoomId}>
                      <Text>Scan QR-code</Text>
                    </Pressable>
                  : null
                : roomId && connected
                  ? <Pressable style={styles.button} onPress={handleDisconnect}>
                      <Text>Disconnect</Text>
                    </Pressable>
                  : null
            }
          </View>
        </View>
      </SafeAreaView>
    )
  }

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: '#fff',
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
  })

  export default App
