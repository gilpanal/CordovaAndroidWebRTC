/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

var constraints = {
    video: true
  };
  

var socket = io.connect('https://react-native-webrtc.herokuapp.com/');

var RTCPeerConnection = window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection || window.msRTCPeerConnection;
var RTCSessionDescription = window.RTCSessionDescription || window.mozRTCSessionDescription || window.webkitRTCSessionDescription || window.msRTCSessionDescription;

var configuration = {"iceServers": [{"urls": "stun:stun.l.google.com:19302"}]};

var pcPeers = {};
var selfView = document.getElementById("selfView");
var remoteViewContainer = document.getElementById("remoteViewContainer");
var localStream;

function handleSuccess(stream) {
  localStream = stream;    
    selfView.srcObject = stream;
    selfView.muted = true;
}

function handleError(error) {
  logError(error);
}
function getLocalStream() {    

    cordova.plugins.diagnostic.requestCameraAuthorization(
        function(status){
            if(status == cordova.plugins.diagnostic.permissionStatus.GRANTED){
                // permission granted - use camera
                navigator.mediaDevices.getUserMedia(constraints).then(handleSuccess).catch(handleError);
               
            }else{
                // permission denied - inform user
            }
        }, function(error){
            console.error("The following error occurred: "+error);
        }, false
    );  
    
   

}

function join(roomID) {
  socket.emit('join', roomID, function(socketIds){
    console.log('join', socketIds);
    for (var i in socketIds) {
      var socketId = socketIds[i];
      createPC(socketId, true);
    }
  });
}

function createPC(socketId, isOffer) {
  var pc = new RTCPeerConnection(configuration);
  pcPeers[socketId] = pc;

  pc.onicecandidate = function (event) {
    console.log('onicecandidate', event);
    if (event.candidate) {
      socket.emit('exchange', {'to': socketId, 'candidate': event.candidate });
    }
  };

  function createOffer() {
    pc.createOffer(function(desc) {
      console.log('createOffer', desc);
      pc.setLocalDescription(desc, function () {
        console.log('setLocalDescription', pc.localDescription);
        socket.emit('exchange', {'to': socketId, 'sdp': pc.localDescription });
      }, logError);
    }, logError);
  }

  pc.onnegotiationneeded = function () {
    console.log('onnegotiationneeded');
    if (isOffer) {
      createOffer();
    }
  }

  pc.oniceconnectionstatechange = function(event) {
    console.log('oniceconnectionstatechange', event);
    if (event.target.iceConnectionState === 'connected') {
      createDataChannel();
    }
  };
  pc.onsignalingstatechange = function(event) {
    console.log('onsignalingstatechange', event);
  };

  pc.onaddstream = function (event) {
    console.log('onaddstream', event);
    var element = document.createElement('video');
    element.id = "remoteView" + socketId;
    element.autoplay = 'autoplay';    
    element.srcObject = event.stream;
    remoteViewContainer.appendChild(element);
  };

  pc.addStream(localStream);
  function createDataChannel() {
    if (pc.textDataChannel) {
      return;
    }
    var dataChannel = pc.createDataChannel("text");

    dataChannel.onerror = function (error) {
      console.log("dataChannel.onerror", error);
    };

    dataChannel.onmessage = function (event) {
      console.log("dataChannel.onmessage:", event.data);
      var content = document.getElementById('textRoomContent');
      content.innerHTML = content.innerHTML + '<p>' + socketId + ': ' + event.data + '</p>';
    };

    dataChannel.onopen = function () {
      console.log('dataChannel.onopen');
      var textRoom = document.getElementById('textRoom');
      textRoom.style.display = "block";
    };

    dataChannel.onclose = function () {
      console.log("dataChannel.onclose");
    };

    pc.textDataChannel = dataChannel;
  }
  return pc;
}

function exchange(data) {
  var fromId = data.from;
  var pc;
  if (fromId in pcPeers) {
    pc = pcPeers[fromId];
  } else {
    pc = createPC(fromId, false);
  }

  if (data.sdp) {
    console.log('exchange sdp', data);
    pc.setRemoteDescription(new RTCSessionDescription(data.sdp), function () {
      if (pc.remoteDescription.type == "offer")
        pc.createAnswer(function(desc) {
          console.log('createAnswer', desc);
          pc.setLocalDescription(desc, function () {
            console.log('setLocalDescription', pc.localDescription);
            socket.emit('exchange', {'to': fromId, 'sdp': pc.localDescription });
          }, logError);
        }, logError);
    }, logError);
  } else {
    console.log('exchange candidate', data);
    pc.addIceCandidate(new RTCIceCandidate(data.candidate));
  }
}

function leave(socketId) {
  console.log('leave', socketId);
  var pc = pcPeers[socketId];
  pc.close();
  delete pcPeers[socketId];
  var video = document.getElementById("remoteView" + socketId);
  if (video) video.remove();
}

socket.on('exchange', function(data){
  exchange(data);
});
socket.on('leave', function(socketId){
  leave(socketId);
});

socket.on('connect', function(data) {
  console.log('connect');
  getLocalStream();
});

function logError(error) {
  console.log("logError", error);
}

function press() {
  var roomID = document.getElementById('roomID').value;
  if (roomID == "") {
    alert('Please enter room ID');
  } else {
    var roomIDContainer = document.getElementById('roomIDContainer');
    roomIDContainer.parentElement.removeChild(roomIDContainer);
    join(roomID);
  }
}
function textRoomPress() {
  var text = document.getElementById('textRoomInput').value;
  if (text == "") {
    alert('Enter something');
  } else {
    document.getElementById('textRoomInput').value = '';
    var content = document.getElementById('textRoomContent');
    content.innerHTML = content.innerHTML + '<p>' + 'Me' + ': ' + text + '</p>';
    for (var key in pcPeers) {
      var pc = pcPeers[key];
      pc.textDataChannel.send(text);
    }
  }
}

var app = {
    // Application Constructor
    initialize: function() {
        document.addEventListener('deviceready', this.onDeviceReady.bind(this), false);
    },

    // deviceready Event Handler
    //
    // Bind any cordova events here. Common events are:
    // 'pause', 'resume', etc.
    onDeviceReady: function() {
        this.receivedEvent('deviceready');
    },

    // Update DOM on a Received Event
    receivedEvent: function(id) {
       
        console.log('Received Event: ' + id);     
    }
};
app.initialize();