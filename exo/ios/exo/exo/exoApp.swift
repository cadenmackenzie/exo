//
//  exoApp.swift
//  exo
//
//  Created by Caden Mackenzie on 11/14/24.
//

import SwiftUI

@main
struct exoApp: App {
   @StateObject private var workerManager = WorkerManager()
    
    var body: some Scene {
        WindowGroup {
            ContentView()
               .environmentObject(workerManager)
        }
    }
}
