//
//  ContentView.swift
//  exo
//
//  Created by Caden Mackenzie on 11/14/24.
//

import SwiftUI

struct ContentView: View {
    @EnvironmentObject var workerManager: WorkerManager
    
    var body: some View {
        VStack(spacing: 20) {
            Text("Exo Worker")
                .font(.title)
            
            Text(workerManager.statusMessage)
                .foregroundColor(workerManager.isRunning ? .green : .red)
                .padding()
                .background(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(workerManager.isRunning ? Color.green : Color.red)
                )
            
            Button(workerManager.isRunning ? "Stop Worker" : "Register Worker") {
                if workerManager.isRunning {
                    workerManager.stopWorker()
                } else {
                    workerManager.startWorker()
                }
            }
            .buttonStyle(.borderedProminent)
        }
        .padding()
    }
}
